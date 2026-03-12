import { chromium, BrowserContext, Page } from 'playwright';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { TokenExtractionError } from '../utils/errors';

export class TokenManager {
    private static instance: TokenManager;
    private context: BrowserContext | null = null;
    private page: Page | null = null;
    private token: string | null = null;
    private isInitializing = false;

    private constructor() { }

    private tryStoreToken(rawValue: string | null | undefined, source: string): boolean {
        if (!rawValue) {
            return false;
        }

        const token = rawValue.startsWith('Bearer ') ? rawValue.slice('Bearer '.length) : rawValue;
        if (!token || token === this.token) {
            return false;
        }

        this.token = token;
        logger.info('TokenManager: Captured fresh Bearer token', { source });
        return true;
    }

    private inspectHeaders(headers: Record<string, string>, source: string) {
        const authHeader = headers['authorization'] ?? headers['Authorization'];
        if (this.tryStoreToken(authHeader, source)) {
            return;
        }

        logger.debug('TokenManager: Prysm request seen without Bearer token', {
            source,
            headerKeys: Object.keys(headers),
        });
    }

    private attachNetworkListeners(page: Page, pageLabel: string) {
        page.on('request', (request) => {
            const url = request.url();
            if (!url.includes('api-agents.prysm.fi')) {
                return;
            }

            logger.info('TokenManager: Saw Prysm request', {
                page: pageLabel,
                method: request.method(),
                url,
            });
            this.inspectHeaders(request.headers(), `page:${pageLabel}:request`);
        });

        page.on('response', async (response) => {
            const url = response.url();
            if (!url.includes('api-agents.prysm.fi')) {
                return;
            }

            logger.info('TokenManager: Saw Prysm response', {
                page: pageLabel,
                status: response.status(),
                url,
            });

            try {
                const request = response.request();
                this.inspectHeaders(await request.allHeaders(), `page:${pageLabel}:response_request_headers`);
            } catch (error) {
                logger.debug('TokenManager: Failed to inspect response request headers', {
                    page: pageLabel,
                    url,
                    error,
                });
            }
        });
    }

    private attachContextListeners(context: BrowserContext) {
        context.on('page', (page) => {
            const pageLabel = `page-${context.pages().length}`;
            logger.info('TokenManager: New page detected', { page: pageLabel });
            this.attachNetworkListeners(page, pageLabel);
        });

        for (const [index, existingPage] of context.pages().entries()) {
            this.attachNetworkListeners(existingPage, `page-${index + 1}`);
        }

        context.on('request', (request) => {
            const url = request.url();
            if (!url.includes('api-agents.prysm.fi')) {
                return;
            }

            logger.info('TokenManager: Saw Prysm context request', {
                method: request.method(),
                url,
                resourceType: request.resourceType(),
            });
            this.inspectHeaders(request.headers(), 'context:request');
        });

        context.on('serviceworker', (worker) => {
            logger.info('TokenManager: Service worker detected', { url: worker.url() });
        });
    }

    private async captureFromStorage(page: Page): Promise<boolean> {
        const token = await page.evaluate(() => {
            const tokenLikeKeys = ['token', 'access_token', 'accessToken', 'authToken', 'idToken'];

            const maybeReadJsonValue = (value: string) => {
                try {
                    const parsed = JSON.parse(value);
                    if (typeof parsed === 'string') {
                        return parsed;
                    }
                    if (parsed && typeof parsed === 'object') {
                        for (const key of tokenLikeKeys) {
                            if (typeof (parsed as Record<string, unknown>)[key] === 'string') {
                                return (parsed as Record<string, string>)[key];
                            }
                        }
                    }
                } catch {
                    return null;
                }

                return null;
            };

            const readStorage = (storage: Storage) => {
                for (let i = 0; i < storage.length; i += 1) {
                    const key = storage.key(i);
                    if (!key) {
                        continue;
                    }

                    const value = storage.getItem(key);
                    if (!value) {
                        continue;
                    }

                    if (tokenLikeKeys.some((candidate) => key.toLowerCase().includes(candidate.toLowerCase()))) {
                        return value;
                    }

                    const parsedValue = maybeReadJsonValue(value);
                    if (parsedValue) {
                        return parsedValue;
                    }
                }

                return null;
            };

            return readStorage(window.localStorage) ?? readStorage(window.sessionStorage);
        });

        return this.tryStoreToken(token, 'browser_storage');
    }

    public static getInstance(): TokenManager {
        if (!TokenManager.instance) {
            TokenManager.instance = new TokenManager();
        }
        return TokenManager.instance;
    }

    public async initialize(): Promise<void> {
        if (this.isInitializing) return;
        this.isInitializing = true;

        try {
            logger.info('TokenManager: Initializing playwright...', {
                profilePath: config.PROFILE_PATH,
                headless: config.HEADLESS,
                chromiumSandbox: config.CHROMIUM_SANDBOX,
                browserChannel: config.BROWSER_CHANNEL,
            });

            this.context = await chromium.launchPersistentContext(config.PROFILE_PATH, {
                channel: config.BROWSER_CHANNEL,
                headless: config.HEADLESS,
                chromiumSandbox: config.CHROMIUM_SANDBOX,
                ignoreDefaultArgs: ['--enable-automation'],
                args: [
                    '--disable-blink-features=AutomationControlled',
                ],
                viewport: { width: 1280, height: 720 },
            });

            this.attachContextListeners(this.context);

            this.page = this.context.pages()[0] ?? await this.context.newPage();

            await this.context.addInitScript(() => {
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => false,
                });
            });

            logger.info('TokenManager: Navigating to Prysm...', { url: config.PRYSM_CHAT_URL });
            await this.page.goto(config.PRYSM_CHAT_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

            // Wait a bit for initial tokens to be captured
            await new Promise(r => setTimeout(r, 5000));
            if (!this.token) {
                await this.captureFromStorage(this.page);
            }

            if (!this.token) {
                logger.warn('TokenManager: No token captured on startup. Manual login might be required if HEADLESS=false. Keep the browser open and trigger one Prysm query to force an authenticated API request.');
            }
        } catch (error) {
            logger.error('TokenManager: Initialization failed', { error });
            throw new TokenExtractionError('Failed to initialize Playwright context');
        } finally {
            this.isInitializing = false;
        }
    }

    public getToken(): string | null {
        return this.token;
    }

    public async refreshToken(): Promise<string> {
        if (!this.page) throw new TokenExtractionError('Browser not initialized');

        logger.info('TokenManager: Refreshing token by reloading page...');
        this.token = null; // Clear old token

        try {
            await this.page.reload({ waitUntil: 'networkidle' });
            if (!this.token) {
                await this.captureFromStorage(this.page);
            }

            // If reload didn't work, try navigating to a new chat
            if (!this.token) {
                logger.info('TokenManager: Reload didn\'t yield token, forcing navigation...');
                await this.page.goto(config.PRYSM_CHAT_URL, { waitUntil: 'networkidle' });
                if (!this.token) {
                    await this.captureFromStorage(this.page);
                }
            }

            if (!this.token) {
                throw new TokenExtractionError('Failed to capture token after refresh/reload');
            }

            return this.token;
        } catch (error) {
            logger.error('TokenManager: Refresh failed', { error });
            throw error;
        }
    }

    public isReady(): boolean {
        return !!this.token;
    }

    public async shutdown(): Promise<void> {
        if (this.context) {
            logger.info('TokenManager: Closing browser...');
            await this.context.close();
            this.context = null;
            this.page = null;
        }
    }
}

export const tokenManager = TokenManager.getInstance();
