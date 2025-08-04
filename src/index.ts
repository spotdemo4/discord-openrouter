import { claudeCode } from "ai-sdk-provider-claude-code";
import { ChannelType, Client, Events, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
import { respond } from "./message.js";

dotenv.config();

// Create a new client instance
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
	],
});

// Initialize the Claude model
if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
	throw new Error("CLAUDE_CODE_OAUTH_TOKEN is not set");
}
const claude = claudeCode("sonnet");

client.once(Events.ClientReady, (readyClient) => {
	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on(Events.MessageCreate, async (message) => {
	if (message.author.bot) return; // Ignore bot messages
	if (!client.user) return; // Ensure the client user is available

	// Mentions the bot
	if (message.mentions.users.has(client.user.id)) {
		await respond(client, message, claude);
		return;
	}

	// A reply to the bot
	if (message.reference) {
		const referencedMessage = await message.fetchReference();
		if (referencedMessage.author.id !== client.user.id) return; // Ignore if the referenced message is not from the bot

		await respond(client, message, claude);
		return;
	}

	// In a thread
	if (
		message.channel.type === ChannelType.PublicThread ||
		message.channel.type === ChannelType.PrivateThread
	) {
		await respond(client, message, claude);
		return;
	}
});

// Log in to Discord with your client's token
client.login(process.env.DISCORD_TOKEN);
