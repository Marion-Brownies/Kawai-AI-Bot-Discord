const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { createAudioPlayer, joinVoiceChannel, createAudioResource, AudioPlayerStatus, VoiceConnectionStatus } = require('@discordjs/voice');
const axios = require('axios');
require('dotenv').config();

// Inisialisasi bot Discord
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

// Mengambil token dan API key dari file .env
const BOT_TOKEN = process.env.BOT_TOKEN;
const API_KEY = process.env.API_KEY;

let queue = [];
let isPlaying = false;
let player;
let connection;

// Inisialisasi Google Generative AI
const genAI = new GoogleGenerativeAI(API_KEY);

// Daftar kata terlarang
const badWords = ["sex", "violence", "harassment", "abuse", "porn", "drugs", "toxic", "kontol", "memek", "fuck", /* tambah kata lainnya */];

// Flag untuk melacak apakah bot sedang memproses permintaan
let isProcessing = false;

// Event saat bot berhasil login
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// Fungsi untuk membagi pesan jika panjangnya lebih dari 1024 karakter
function splitEmbedFields(text, maxLength = 1024) {
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.slice(i, i + maxLength));
  }
  return chunks;
}

// Fungsi untuk memeriksa kata terlarang
function containsBadWords(text) {
  const lowerText = text.toLowerCase();
  return badWords.some(word => lowerText.includes(word));
}

// Fungsi untuk memutar lagu
async function playMusic(interaction, url) {
  if (!connection) {
    const channel = interaction.member.voice.channel;
    if (!channel) {
      await interaction.reply('Please join a voice channel first!');
      return;
    }
    connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator
    });

    connection.on(VoiceConnectionStatus.Disconnected, () => {
      queue = [];
      isPlaying = false;
      connection = null;
    });
  }

  // Mengambil stream audio
  const audioResource = createAudioResource(url);
  if (!player) {
    player = createAudioPlayer();
    connection.subscribe(player);
  }

  player.play(audioResource);

  player.on(AudioPlayerStatus.Idle, () => {
    queue.shift();
    if (queue.length > 0) {
      playMusic(interaction, queue[0].url);
    } else {
      isPlaying = false;
    }
  });
}

// Event untuk menangani slash command
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // Command ask
  if (interaction.commandName === 'ask') {
    const prompt = interaction.options.getString('question');

    // Jika prompt kosong, minta input dari user
    if (!prompt) {
      await interaction.reply('Please provide a question after `/ask`.');
      return;
    }

    // Cek apakah bot sedang memproses permintaan lain
    if (isProcessing) {
      await interaction.reply('The bot is processing another request, please wait.');
      return;
    }

    // Set flag bahwa bot sedang memproses permintaan
    isProcessing = true;

    // Buat embed notifikasi bahwa bot sedang memproses permintaan
    const processingEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Processing Request...')
      .setDescription('Your request is being processed. Please wait...')
      .setTimestamp();

    // Kirim notifikasi embed ke user
    await interaction.reply({ embeds: [processingEmbed] });

    try {
      // Kirim permintaan ke API Google Generative AI
      const contents = [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ];

      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash", // atau gemini-1.5-pro sesuai kebutuhan
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

      // Jika panjang teks lebih dari 1024 karakter, bagi menjadi beberapa bagian untuk embed fields
      const embedFields = splitEmbedFields(reply);

      // Buat embed respons dengan pertanyaan user dan jawaban dari AI
      const responseEmbed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Response from AI')
        .setDescription(`**Question:** ${prompt}`)
        .setTimestamp();

      // Tambahkan setiap bagian teks sebagai field di embed
      embedFields.forEach((fieldText, index) => {
        if (fieldText.trim() !== '') {
          responseEmbed.addFields({ name: `Answer Part ${index + 1}:`, value: fieldText });
        }
      });

      // Kirim embed respons ke user
      await interaction.editReply({ embeds: [responseEmbed] });

    } catch (error) {
      if (error.message.includes('Response was blocked due to safety concerns.')) {
        await interaction.editReply('Sorry, the content you requested was blocked due to safety concerns.');
      } else {
        console.error('Error fetching response from AI:', error);
        await interaction.editReply('Sorry, there was an error processing your request.');
      }
    } finally {
      // Reset flag setelah proses selesai
      isProcessing = false;
    }
  }

  // Command profile
  else if (interaction.commandName === 'profile') {
    const user = interaction.options.getUser('user') || interaction.user;
    const member = interaction.guild.members.cache.get(user.id);

    const joinedDiscordAt = user.createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const joinedServerAt = member.joinedAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

    const profileEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`${user.username}'s Profile`)
      .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 512 }))
      .addFields(
        { name: 'Username', value: user.tag, inline: true },
        { name: 'User ID', value: user.id, inline: true },
        { name: 'Joined Discord on', value: joinedDiscordAt, inline: true },
        { name: 'Joined Server on', value: joinedServerAt, inline: true }
      )
      .setFooter({ text: `Requested by ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL({ dynamic: true }) })
      .setTimestamp();

    await interaction.reply({ embeds: [profileEmbed] });
  }

  // Command play
  if (interaction.commandName === 'play') {
    const songName = interaction.options.getString('song');
    if (!songName) {
      await interaction.reply('Please specify a song name!');
      return;
    }

    try {
      const response = await axios.get(`https://api.deezer.com/search?q=${encodeURIComponent(songName)}`);
      const songs = response.data.data.slice(0, 5); // Ambil 5 lagu pertama dari hasil pencarian

      if (songs.length === 0) {
        await interaction.reply('No songs found!');
        return;
      }

      // Buat embed yang menampilkan 5 lagu
      const songEmbed = new EmbedBuilder()
        .setColor('#1DB954')
        .setTitle(`Search Results for: ${songName}`)
        .setDescription(songs.map((song, index) => `${index + 1}. **${song.title}** by **${song.artist.name}**`).join('\n'))
        .setFooter({ text: 'Please choose a song by clicking the corresponding number.' });

      // Membuat tombol angka 1 - 5 untuk memilih lagu
      const buttons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder().setCustomId('song1').setLabel('1').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('song2').setLabel('2').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('song3').setLabel('3').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('song4').setLabel('4').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('song5').setLabel('5').setStyle(ButtonStyle.Primary),
        );

      // Simpan hasil pencarian ke state sementara agar bisa diakses saat tombol ditekan
      const songChoices = songs.map((song) => ({
        title: song.title,
        artist: song.artist.name,
        url: song.preview
      }));

      // Kirim embed dan tombol angka ke user
      await interaction.reply({ embeds: [songEmbed], components: [buttons] });

      // Event handler untuk tombol pilihan lagu
      const filter = i => i.customId.startsWith('song') && i.user.id === interaction.user.id;
      const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });

      collector.on('collect', async i => {
        const selectedIndex = parseInt(i.customId.replace('song', '')) - 1; // Dapatkan nomor lagu yang dipilih
        const selectedSong = songChoices[selectedIndex];

        queue.push({ title: selectedSong.title, url: selectedSong.url });

        if (!isPlaying) {
          isPlaying = true;
          playMusic(interaction, selectedSong.url);
        }

        await i.update({ content: `Now playing: **${selectedSong.title}** by **${selectedSong.artist}**`, components: [] });
      });

    } catch (error) {
      console.error(error);
      await interaction.reply('There was an error trying to search for the song!');
    }
  }

  // Command leave
  else if (interaction.commandName === 'leave') {
    if (connection) {
      connection.destroy();
      queue = [];
      isPlaying = false;
      connection = null;
      await interaction.reply('Left the voice channel!');
    } else {
      await interaction.reply('I am not in a voice channel!');
    }
  }

  // Command queue
  else if (interaction.commandName === 'queue') {
    if (queue.length === 0) {
      await interaction.reply('The queue is empty!');
    } else {
      const queueEmbed = new EmbedBuilder()
        .setColor('#1DB954')
        .setTitle('Music Queue')
        .setDescription(queue.map((song, index) => `${index + 1}. ${song.title}`).join('\n'));

      await interaction.reply({ embeds: [queueEmbed] });
    }
  }

  // Command skip
  else if (interaction.commandName === 'skip') {
    if (queue.length > 1) {
      player.stop();
      await interaction.reply('Skipped the current song!');
    } else {
      await interaction.reply('No songs to skip!');
    }
  }
});

client.login(BOT_TOKEN);
