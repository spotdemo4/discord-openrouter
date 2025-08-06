import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, type ModelMessage } from "ai";
import type { User } from "./database.js";
import { blacklistModel } from "./model.js";

// Ensure the OpenRouter API key is set
if (!process.env.OPENROUTER_API_KEY) {
	console.error("OPENROUTER_API_KEY is not set");
	process.exit(1);
}

const openrouter = createOpenRouter({
	apiKey: process.env.OPENROUTER_API_KEY,
});

export type GenerateResult = NonNullable<Awaited<ReturnType<typeof generate>>>;

export async function generate(user: User, messages: ModelMessage[]) {
	if (!user.model) return;

	try {
		const result = await generateText({
			model: openrouter(user.model.id),
			messages: messages,
			system: user.system || "",
		});

		let text = result.text;

		// strip thinking tags
		if (text.includes("</think>")) {
			text = text.split("</think>")[1] ?? text;
		}

		return {
			text: text.trim(),
			result: result,
		};
	} catch (error) {
		console.error("Error generating text:", error);
		console.log("Blacklisting model:", user.model.id);
		blacklistModel(user.model.id);
	}

	return null;
}
