const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { DisTube } = require('distube');
const { SpotifyPlugin } = require('@distube/spotify');
const { SoundCloudPlugin } = require('@distube/soundcloud');
const { YtDlpPlugin } = require('@distube/yt-dlp');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const BOT_TOKEN = process.env.BOT_TOKEN;
const API_KEY = process.env.API_KEY;

const genAI = new GoogleGenerativeAI(API_KEY);

const distube = new DisTube(client, {
  plugins: [
    new SpotifyPlugin(),
    new SoundCloudPlugin(),
    new YtDlpPlugin()
  ],
  leaveOnEmpty: true,
  leaveOnFinish: true,
  leaveOnStop: true,
  searchSongs: 5
});

let isProcessing = false;

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

function splitEmbedFields(text, maxLength = 1024) {
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.slice(i, i + maxLength));
  }
  return chunks;
}

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // Ask command
  if (interaction.commandName === 'ask') {
    const prompt = interaction.options.getString('question');

    if (!prompt) {
      await interaction.reply('Please provide a question after `/ask`.');
      return;
    }

    if (isProcessing) {
      await interaction.reply('The bot is processing another request, please wait.');
      return;
    }

    isProcessing = true;

    const processingEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Processing Request...')
      .setDescription('Your request is being processed. Please wait...')
      .setTimestamp();

    await interaction.reply({ embeds: [processingEmbed] });

    try {
      const contents = [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ];

      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash", // or gemini-1.5-pro as needed
      });

      const result = await model.generateContentStream({ contents });

      let buffer = [];
      for await (let response of result.stream) {
        if (response.candidates && response.candidates[0].blockedReason) {
          throw new Error('Response was blocked due to safety concerns.');
        }
        buffer.push(response.text());
      }

      const reply = buffer.join('');

      const embedFields = splitEmbedFields(reply);

      const responseEmbed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Response from AI')
        .setDescription(`**Question:** ${prompt}`)
        .setTimestamp();

      embedFields.forEach((fieldText, index) => {
        if (fieldText.trim() !== '') {
          responseEmbed.addFields({ name: `Answer Part ${index + 1}:`, value: fieldText });
        }
      }); // end of embedFields.forEach

      await interaction.editReply({ embeds: [responseEmbed] });
    } catch (error) {
      console.error('Error generating response:', error);
      await interaction.editReply({ content: 'An error occurred while generating the response.' });
    } finally {
      isProcessing = false;
    }
  }

  // Profile command
  if (interaction.commandName === 'profile') {
    const user = interaction.options.getUser('user') || interaction.user;

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`Profile for ${user.username}`)
      .setDescription(`**Username:** ${user.username}\n**Tag:** ${user.tag}\n**ID:** ${user.id}`)
      .setThumbnail(user.displayAvatarURL())
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  // Play command
  if (interaction.commandName === 'play') {
    const query = interaction.options.getString('song');
    if (!query) {
      await interaction.reply('Please specify a song name or artist!');
      return;
    }

    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
      await interaction.reply('You need to be in a voice channel to play music!');
      return;
    }

    try {
      await interaction.deferReply();
      const searchResult = await distube.search(query, { limit: 5 });

      if (!searchResult || searchResult.length === 0) {
        await interaction.editReply('No songs found for your search query.');
        return;
      }

      const songListEmbed = new EmbedBuilder()
        .setColor('#1DB954')
        .setTitle(`Search Results for: ${query}`)
        .setDescription(searchResult.map((song, index) => `${index + 1}. ${song.name} - ${song.uploader.name}`).join('\n'))
        .setFooter({ text: 'Select a song by clicking the corresponding button.' });

      const row = new ActionRowBuilder()
        .addComponents(
          ...searchResult.map((_, index) => 
            new ButtonBuilder()
              .setCustomId(`select_${index}`)
              .setLabel(`${index + 1}`)
              .setStyle(ButtonStyle.Primary)
          )
        );

      const response = await interaction.editReply({ embeds: [songListEmbed], components: [row] });

      const filter = i => i.customId.startsWith('select_') && i.user.id === interaction.user.id;
      const collector = response.createMessageComponentCollector({ filter, time: 30 * 1000 });

      collector.on('collect', async i => {
        const selectedSongIndex = parseInt(i.customId.split('_')[1]);
        const selectedSong = searchResult[selectedSongIndex];

        await i.deferUpdate();
        await interaction.editReply({ content: `Playing: ${selectedSong.name} - ${selectedSong.uploader.name}`, components: [] });

        distube.play(voiceChannel, selectedSong.url, {
          member: interaction.member,
          textChannel: interaction.channel
        });
      });

      collector.on('end', async () => {
        await interaction.editReply({ content: 'Song selection timed out.', components: [] });
      });
    } catch (error) {
      console.error('Error playing song:', error);
      await interaction.editReply('An error occurred while playing the song.');
    }
  }

  // Leave command
  if (interaction.commandName === 'leave') {
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
      await interaction.reply('You need to be in a voice channel to use this command!');
      return;
    }

    try {
      await distube.leave(voiceChannel);
      await interaction.reply('Left the voice channel.');
    } catch (error) {
      console.error('Error leaving voice channel:', error);
      await interaction.reply('An error occurred while leaving the voice channel.');
    }
  }

  // Queue command
  if (interaction.commandName === 'queue') {
    const queue = distube.getQueue(interaction.guild);

    if (!queue) {
      await interaction.reply('No songs in the queue.');
      return;
    }

    const queueEmbed = new EmbedBuilder()
      .setColor('#1DB954')
      .setTitle('Queue')
      .setDescription(queue.songs.map((song, index) => `${index + 1}. ${song.name} - ${song.uploader.name}`).join('\n'))
      .setFooter({ text: 'Current queue.' });

    await interaction.reply({ embeds: [queueEmbed] });
  }

  // Skip command
  if (interaction.commandName === 'skip') {
    const queue = distube.getQueue(interaction.guild);

    if (!queue) {
      await interaction.reply('No songs in the queue.');
      return;
    }

    try {
      await distube.skip();
      await interaction.reply('Skipped the current song.');
    } catch ( error) {
      console.error('Error skipping song:', error);
      await interaction.reply('An error occurred while skipping the song.');
    }
  }
});

client.login(BOT_TOKEN);