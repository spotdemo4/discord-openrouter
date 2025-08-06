import {
	Client,
	GatewayIntentBits,
	Partials,
	REST,
	Routes,
	SlashCommandBuilder,
} from "discord.js";
import { models } from "./model.js";

// Ensure the Discord Token is set
if (!process.env.DISCORD_TOKEN) {
	console.error("DISCORD_TOKEN is not set");
	process.exit(1);
}

export const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.DirectMessages,
	],
	partials: [Partials.Channel, Partials.Message],
});
const rest = new REST().setToken(process.env.DISCORD_TOKEN);

export async function registerSlashCommands() {
	if (!client.user?.id) return;

	const slashModel = new SlashCommandBuilder()
		.setName("model")
		.setDescription("Set the model to use for responses")
		.addStringOption((option) =>
			option
				.setName("model")
				.setDescription("The model to use")
				.setRequired(true)
				.setChoices(
					models.slice(0, 25).map((model) => ({
						name: model.name,
						value: model.id,
					})),
				),
		);
	const slashSystem = new SlashCommandBuilder()
		.setName("system")
		.setDescription("Set the system prompt")
		.addStringOption((option) =>
			option
				.setName("prompt")
				.setDescription("The system prompt to use")
				.setRequired(true)
				.setMaxLength(2000),
		);
	const slashInfo = new SlashCommandBuilder()
		.setName("info")
		.setDescription("Get info about your current model");
	const slashReset = new SlashCommandBuilder()
		.setName("reset")
		.setDescription("Reset all settings to default");

	await rest.put(Routes.applicationCommands(client.user.id), {
		body: [
			slashModel.toJSON(),
			slashSystem.toJSON(),
			slashInfo.toJSON(),
			slashReset.toJSON(),
		],
	});
	console.log("registered slash commands");
}
