import type { ModelMessage, UserContent } from "ai";
import {
	type ClientUser,
	ComponentType,
	type Message,
	type MessageCreateOptions,
	MessageFlags,
} from "discord.js";
import type { User } from "./database.js";
import { models } from "./model.js";
import type { GenerateResult } from "./router.js";

export function toAIMessage(
	user: User,
	client: ClientUser,
	message: Message<boolean>,
) {
	let text = message.cleanContent.replace(`@${client.displayName}`, "").trim();

	// get text from components
	for (const component of message.components) {
		if (component.type === ComponentType.TextDisplay) {
			// Skip footers
			if (component.id === 10) continue;

			text += component.content.trim();
		}
	}

	// This is an assistant message
	if (message.author.id === client.id) {
		if (!text) return; // Ignore empty messages

		const m: ModelMessage = {
			role: "assistant",
			content: [
				{
					type: "text",
					text: text,
				},
			],
		};
		return m;
	}

	// This is a user message
	const content: UserContent = [];
	if (text) {
		content.push({
			type: "text",
			text: text,
		});
	}

	// Get content from embeds
	for (const embed of message.embeds) {
		let embedText = "";
		if (embed.author?.name) {
			embedText += `${embed.author.name}:\n`;
		}
		if (embed.title) {
			embedText += `${embed.title}\n`;
		}
		if (embed.description) {
			embedText += `${embed.description}\n`;
		}

		embedText = embedText.replace("\.", "."); // For some reason discord adds a backslash before periods
		embedText = embedText.trim().replace(/[\r\n]+/g, " "); // Remove newlines and extra spaces
		if (embedText) {
			content.push({
				type: "text",
				text: `"${embedText}"`,
			});
		}
	}

	// If the model accepts images, include images
	if (user.model?.architecture.input_modalities.includes("image")) {
		for (const attachment of message.attachments.values()) {
			if (attachment.contentType?.startsWith("image/")) {
				content.push({
					type: "image",
					image: new URL(attachment.url),
				});
			}
		}
	}

	// If the model accepts files, include files
	if (user.model?.architecture.input_modalities.includes("file")) {
		for (const attachment of message.attachments.values()) {
			if (
				attachment.contentType &&
				!attachment.contentType.startsWith("image/")
			) {
				content.push({
					type: "file",
					data: new URL(attachment.url),
					filename: attachment.name,
					mediaType: attachment.contentType,
				});
			}
		}
	}

	if (content.length === 0) return;

	const m: ModelMessage = {
		role: "user",
		content: content,
	};
	return m;
}

export async function toDiscordMessages(
	gen: GenerateResult,
): Promise<MessageCreateOptions[]> {
	if (gen.text.length > 1800) {
		// Discord has a 2000 character limit for messages
		// I don't know what the size of the footer is so I just chunk at 1800 to be safe
		const limit = gen.text.slice(0, 1800);
		const breakIndex = limit.lastIndexOf("\n");

		const start = breakIndex !== -1 ? gen.text.slice(0, breakIndex) : limit;
		const end =
			breakIndex !== -1 ? gen.text.slice(breakIndex) : gen.text.slice(1800);

		const payload: MessageCreateOptions = {
			flags: MessageFlags.IsComponentsV2,
			components: [
				{
					type: ComponentType.TextDisplay,
					content: start,
				},
			],
			allowedMentions: { repliedUser: true },
		};

		gen.text = end;
		return [payload, ...(await toDiscordMessages(gen))];
	}

	const footer: string[] = [];
	const model = models.find((m) => m.id === gen.result.response.modelId);
	if (model) {
		footer.push(`${model.name}`);
	}
	if (gen.result.totalUsage.inputTokens) {
		footer.push(
			`${gen.result.totalUsage.inputTokens.toLocaleString()} input tokens`,
		);
	}
	if (gen.result.totalUsage.outputTokens) {
		footer.push(
			`${gen.result.totalUsage.outputTokens.toLocaleString()} output tokens`,
		);
	}

	const payload: MessageCreateOptions = {
		flags: MessageFlags.IsComponentsV2,
		components: [
			{
				type: ComponentType.TextDisplay,
				content: gen.text,
			},
			{
				type: ComponentType.Separator,
				divider: true,
			},
			{
				type: ComponentType.TextDisplay,
				content: `-# ${footer.join(" - ")}`,
				id: 10, // used to identify footer
			},
		],
		allowedMentions: { repliedUser: true },
	};

	return [payload];
}
