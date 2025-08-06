import { ChannelType, Events, MessageFlags } from "discord.js";
import dotenv from "dotenv";
import { database, getUser } from "./database.js";
import { client, registerSlashCommands } from "./discord.js";
import { respond } from "./message.js";
import { models } from "./model.js";
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

	// Mentions the bot
	if (message.mentions.users.has(client.user.id)) {
		await respond(client, message);
		return;
	}

	// A reply to the bot
	if (message.reference) {
		const referencedMessage = await message.fetchReference();
		if (referencedMessage.author.id !== client.user.id) return; // Ignore if the referenced message is not from the bot

		await respond(client, message);
		return;
	}

	// In a thread
	if (
		message.channel.type === ChannelType.PublicThread ||
		message.channel.type === ChannelType.PrivateThread
	) {
		await respond(client, message);
		return;
	}

	// In a private message
	if (message.channel.type === ChannelType.DM) {
		await respond(client, message);
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
