import type { ModelMessage, UserContent } from "ai";
import {
	ChannelType,
	type Client,
	type ClientUser,
	ComponentType,
	type Message,
	MessageFlags,
	TextChannel,
} from "discord.js";
import { getUser, type User } from "./database.js";
import { models } from "./model.js";
import { type GenerateResult, generate } from "./router.js";

export async function respond(
	client: Client<boolean>,
	message: Message<boolean>,
) {
	console.log(`processing message from ${message.author.displayName}`);

	if (message.channel instanceof TextChannel) {
		await message.channel.sendTyping(); // Indicate that the bot is typing
	}

	const user = getUser(message.author.id);
	if (!user.model) {
		message.reply({
			content: "No suitable model found. Please try again later.",
			allowedMentions: { repliedUser: true },
		});
		return;
	}

	console.log(`responding with ${user.model.id}`);

	// Get the context for the message
	const context = await getContext(user, client, message);
	if (context.length === 0) {
		message.reply({
			content: "Please provide some context.",
			allowedMentions: { repliedUser: true },
		});
		return;
	}

	// Generate the response
	const result = await generate(user, context);
	if (!result) {
		message.reply({
			content:
				"Sorry, I encountered an error while processing your request. Please try again.",
			allowedMentions: { repliedUser: true },
		});

		return;
	}

	return await reply(message, result);
}

async function getContext(
	user: User,
	client: Client<boolean>,
	message: Message<boolean>,
) {
	if (!client.user) return [];
	const clientUser = client.user;

	// If this is a thread, the context is the thread itself
	if (
		message.channel.type === ChannelType.PublicThread ||
		message.channel.type === ChannelType.PrivateThread
	) {
		const threadMessages = await message.channel.messages.fetch({ limit: 100 });
		const formattedMessages = threadMessages.map(
			async (msg) => await formatMessage(user, clientUser, msg),
		);
		const awaitedMessages = await Promise.all(formattedMessages);
		return awaitedMessages.filter((msg) => msg !== undefined);
	}

	// If this is a reply, fetch the referenced message
	let context: ModelMessage[] = [];
	if (message.reference) {
		const referencedMessage = await message.fetchReference();
		context = await getContext(user, client, referencedMessage);
	}

	const formattedMessage = await formatMessage(user, clientUser, message);
	if (formattedMessage) {
		context.push(formattedMessage);
	}

	return context;
}

async function formatMessage(
	user: User,
	clientUser: ClientUser,
	message: Message<boolean>,
) {
	const text = message.cleanContent
		.replace(`@${clientUser.displayName}`, "")
		.trim();

	// This is an assistant message
	if (message.author.id === clientUser.id) {
		console.log(`- assistant: ${text}`);
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
		console.log(`- user: ${text}`);
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
			console.log(`- user: embed ${embedText}`);
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
				console.log(`- user: image ${attachment.url}`);
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
				console.log(`- user: file ${attachment.url}`);
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

async function reply(message: Message<boolean>, gen: GenerateResult) {
	if (gen.text.length > 1800) {
		// Discord has a 2000 character limit for messages
		// I don't know what the size of the footer is so I just chunk at 1800 to be safe
		const limit = gen.text.slice(0, 1800);
		const breakIndex = limit.lastIndexOf("\n");

		const start = breakIndex !== -1 ? gen.text.slice(0, breakIndex) : limit;
		const end =
			breakIndex !== -1 ? gen.text.slice(breakIndex) : gen.text.slice(1800);

		const response = await message.reply({
			flags: MessageFlags.IsComponentsV2,
			components: [
				{
					type: ComponentType.TextDisplay,
					content: start,
				},
			],
			allowedMentions: { repliedUser: true },
		});

		gen.text = end;
		return await reply(response, gen);
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

	return await message.reply({
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
			},
		],
		allowedMentions: { repliedUser: true },
	});
}
