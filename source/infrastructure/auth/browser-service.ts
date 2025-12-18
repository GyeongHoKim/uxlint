export type IBrowserService = {
	openUrl(url: string): Promise<void>;
	isAvailable(): Promise<boolean>;
};
