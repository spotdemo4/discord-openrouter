import {
	ChannelType,
	Events,
	MessageFlags,
	ThreadAutoArchiveDuration,
} from "discord.js";
import dotenv from "dotenv";
import { database, getUser } from "./database.js";
import { client, getContext, registerSlashCommands } from "./discord.js";
import { toAIMessage, toDiscordMessages } from "./message.js";
import { models } from "./model.js";
import { generate } from "./router.js";
import { dedent } from "./util.js";

dotenv.config({
	quiet: true,
});

client.once(Events.ClientReady, async (readyClient) => {
	console.log(`logged in as ${readyClient.user.tag}`);
	await registerSlashCommands();
});

client.on(Events.MessageCreate, async (message) => {
	if (message.author.bot) return; // Ignore bot messages
	if (!client.user) return; // Ensure the client user is available
	const clientUser = client.user;

	const user = getUser(message.author.id);
	if (!user.model) return; // Ensure the user has a model available to use

	// In a thread
	if (
		message.channel.isThread() &&
		message.channel.ownerId === client.user.id
	) {
		console.log(`processing message from ${message.author.tag}`);

		// Get all thread messages
		let messages = await message.channel.messages.fetch({ limit: 100 });
		messages = messages.reverse(); // Reverse the messages to get oldest first

		// Format messages for AI
		const session = messages
			.map((msg) => toAIMessage(user, clientUser, msg))
			.filter((msg) => msg !== undefined);
		if (session.length === 0) {
			await message.channel.send({
				content: "Please provide some context.",
				allowedMentions: { repliedUser: true },
			});
			return;
		}

		// Print the session for debug
		session.forEach((msg) => {
			console.log(`${msg.role}: ${JSON.stringify(msg.content)}`);
		});

		// Generate reponse
		const response = await generate(user, session);
		if (!response) {
			await message.channel.send({
				content:
					"Sorry, I encountered an error while processing your request. Please try again.",
				allowedMentions: { repliedUser: true },
			});
			return;
		}

		// Send reply in Discord thread
		const payloads = await toDiscordMessages(response);
		for (const payload of payloads) {
			const reply = toAIMessage(
				user,
				clientUser,
				await message.channel.send(payload),
			);
			if (!reply) continue; // Skip if the reply is undefined

			// Push the reply to the session for context in future messages
			session.push(reply);
		}

		// Rename the thread to match what is being discussed
		if (response && message.channel.name.startsWith("Chat with")) {
			const topic = await generate(
				user,
				session,
				dedent(`You are a youtube video title generator. 
					Generate a concise title for the following conversation. 
					Please be as brief as possible, ideally only a couple words. 
					Do not make it longer than 100 characters.`),
			);
			if (topic) {
				await message.channel.setName(`${topic.text.slice(0, 100)}`);
			}
		}

		return;
	}

	// Is a DM, mentions the bot, or is a reply to the bot
	if (
		message.channel.type === ChannelType.DM ||
		message.mentions.users.has(clientUser.id) ||
		(message.reference &&
			(await message.fetchReference()).author.id === clientUser.id)
	) {
		console.log(`processing message from ${message.author.tag}`);

		// Get the full context of the message, including all replies
		let messages = await getContext(message);
		messages = messages.reverse(); // Reverse the messages to get oldest first

		// Format messages for AI
		const session = messages
			.map((msg) => toAIMessage(user, clientUser, msg))
			.filter((msg) => msg !== undefined);
		if (session.length === 0) {
			await message.reply({
				content: "Please provide some context.",
				allowedMentions: { repliedUser: true },
			});
			return;
		}

		// Print the session for debug
		session.forEach((msg) => {
			console.log(`${msg.role}: ${JSON.stringify(msg.content)}`);
		});

		// Generate reponse
		const response = await generate(user, session);
		if (!response) {
			await message.reply({
				content:
					"Sorry, I encountered an error while processing your request. Please try again.",
				allowedMentions: { repliedUser: true },
			});
			return;
		}

		// Send reply to Discord user
		const payloads = await toDiscordMessages(response);
		let lastMessage = message;
		for (const payload of payloads) {
			lastMessage = await lastMessage.reply(payload);
		}

		return;
	}
});

client.on(Events.InteractionCreate, async (interaction) => {
	if (!interaction.isChatInputCommand()) return;

	if (interaction.commandName === "model") {
		const modelId = interaction.options.getString("model", true);
		if (!modelId) {
			await interaction.reply({
				content: "You must specify a model.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const model = models.find((m) => m.id === modelId);
		if (!model) {
			await interaction.reply({
				content: `Sorry, that model is no longer available.`,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// Save model to database
		const query = database.prepare(`
			INSERT OR REPLACE INTO users (id, model) VALUES (?, ?);
		`);
		query.run(interaction.user.id, model.id);

		await interaction.reply({
			content: `You are now using **${model.name}** (${model.id})`,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (interaction.commandName === "chat") {
		if (!interaction.channel) {
			await interaction.reply({
				content: "This command can only be used in a text channel.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}
		if (interaction.channel.type !== ChannelType.GuildText) {
			await interaction.reply({
				content: "This command can only be used in a text channel.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// Start a new thread for the chat
		const thread = await interaction.channel.threads.create({
			name: `Chat with ${interaction.user.displayName}`,
			autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
			type: ChannelType.PrivateThread,
			reason: "User started a chat",
		});

		// Join the thread
		await thread.join();

		// Invite the user to the thread
		await thread.members.add(interaction.user.id);

		await interaction.reply({
			content: `Started a new chat thread: [${thread.name}](${thread.url})`,
			flags: MessageFlags.Ephemeral,
		});

		return;
	}

	if (interaction.commandName === "system") {
		const prompt = interaction.options.getString("prompt", true);
		if (!prompt) {
			await interaction.reply({
				content: "You must provide a system prompt.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// Save system prompt to database
		const query = database.prepare(`
			INSERT OR REPLACE INTO users (id, system) VALUES (?, ?);
		`);
		query.run(interaction.user.id, prompt);

		await interaction.reply({
			content: `Your system prompt has been set.`,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (interaction.commandName === "info") {
		// get user's current model
		const user = getUser(interaction.user.id);

		if (!user.model) {
			interaction.reply({
				content: "No models are currently available.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		await interaction.reply({
			content: dedent(`
				**${user.model.name}**
				-# last updated: ${new Date(user.model.created * 1000).toLocaleString()}
				-# context: ${user.model.context_length.toLocaleString()} tokens
				-# price: $${(parseFloat(user.model.pricing.prompt) * 1000000).toFixed(2)}/M input tokens, $${(parseFloat(user.model.pricing.completion) * 1000000).toFixed(2)}/M output tokens
				-# modality: ${user.model.architecture.input_modalities.join(", ")} -> ${user.model.architecture.output_modalities.join(", ")}
				${user.model.description}

				**System Prompt**
				${user?.system?.replace(/[\r\n]+/g, " ") || "not set"}
			`),
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	if (interaction.commandName === "reset") {
		// Remove user from database
		const query = database.prepare(`
			DELETE FROM users WHERE id = ?;
		`);
		query.run(interaction.user.id);

		await interaction.reply({
			content: `Your settings have been reset to default.`,
			flags: MessageFlags.Ephemeral,
		});
		return;
	}
});

// Log in to Discord with your client's token
client.login(process.env.DISCORD_TOKEN);
