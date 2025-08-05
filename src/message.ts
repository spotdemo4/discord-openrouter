import { generateText, type LanguageModel, type ModelMessage } from "ai";
import {
	ChannelType,
	type Client,
	type ClientUser,
	type Message,
} from "discord.js";

export async function respond(
	client: Client<boolean>,
	message: Message<boolean>,
	router: LanguageModel,
) {
	const context = await getContext(client, message);

	if (context.length === 0) {
		message.reply({
			content: "Please provide some context.",
			allowedMentions: { repliedUser: true },
		});
		return;
	}

	const result = await generateText({
		model: router,
		messages: context,
	});

	message.reply({
		content: result.text,
		allowedMentions: { repliedUser: true },
	});
}

async function getContext(client: Client<boolean>, message: Message<boolean>) {
	if (!client.user) return [];
	const clientUser = client.user;

	// If this is a thread, the context is the thread itself
	if (
		message.channel.type === ChannelType.PublicThread ||
		message.channel.type === ChannelType.PrivateThread
	) {
		const threadMessages = await message.channel.messages.fetch({ limit: 100 });
		const formattedMessages = threadMessages.map((msg) =>
			formatMessage(clientUser, msg),
		);
		return formattedMessages.filter((msg) => msg !== undefined);
	}

	// If this is a reply, fetch the referenced message
	let context: ModelMessage[] = [];
	if (message.reference) {
		const referencedMessage = await message.fetchReference();
		context = await getContext(client, referencedMessage);
	}

	const formattedMessage = formatMessage(clientUser, message);
	if (formattedMessage) {
		context.push(formattedMessage);
	}

	return context;
}

export function formatMessage(
	clientUser: ClientUser,
	message: Message<boolean>,
) {
	const content = message.cleanContent
		.replace(`@${clientUser.displayName}`, "")
		.trim();

	if (content) {
		return {
			role: message.author.id === clientUser.id ? "assistant" : "user",
			content: [
				{
					type: "text",
					text: content,
				},
			],
		} as ModelMessage;
	}
}
