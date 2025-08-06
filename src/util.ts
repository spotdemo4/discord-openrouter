export function dedent(str: string) {
	return str
		.split("\n")
		.map((line) => line.trim())
		.join("\n");
}

export function getURLs(text: string): string[] {
	const urls: string[] = [];
	const words = text.split(/\s+/);
	for (const word of words) {
		try {
			new URL(word);
			urls.push(word);
		} catch {
			// Not a valid URL
		}
	}

	return urls;
}
