const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config(); // Menggunakan dotenv untuk menyimpan token dan API key dengan aman

// Inisialisasi bot Discord
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// Mengambil token dan API key dari file .env
const BOT_TOKEN = process.env.BOT_TOKEN;
const API_KEY = process.env.API_KEY;

// Inisialisasi Google Generative AI
const genAI = new GoogleGenerativeAI(API_KEY);

// Daftar kata terlarang
const badWords = ["sex", "violence", "harassment", "abuse", "porn", "drugs", "toxic", "kontol", "memek", "toxic", "fuck", /* tambah kata lainnya */];

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

// Command handler saat ada pesan yang dikirim di Discord
client.on('messageCreate', async (message) => {
  // Pastikan bot tidak merespon pesan dari dirinya sendiri
  if (message.author.bot) return;

  // Jika pesan mengandung kata terlarang
  if (containsBadWords(message.content)) {
    message.reply('Warning: Your message contains inappropriate language. Please be careful!');
    return;
  }

  // Jika pesan dimulai dengan "!ask"
  if (message.content.startsWith('!ask')) {
    const prompt = message.content.replace('!ask', '').trim();

    // Jika prompt kosong, minta input dari user
    if (!prompt) {
      message.reply('Please provide a question after "!ask".');
      return;
    }

    // Cek apakah bot sedang memproses permintaan lain
    if (isProcessing) {
      message.reply('The bot is processing another request, please wait.');
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
    await message.reply({ embeds: [processingEmbed] });

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
          if (fieldText.trim() !== '') { // Periksa apakah fieldText tidak kosong
            responseEmbed.addFields({ name: `Answer Part ${index + 1}:`, value: fieldText });
          }
        });
     
  

      // Kirim embed respons ke user
      await message.reply({ embeds: [responseEmbed] });

    } catch (error) {
      if (error.message.includes('Response was blocked due to safety concerns.')) {
        message.reply('Sorry, the content you requested was blocked due to safety concerns.');
      } else {
        console.error('Error fetching response from AI:', error);
        message.reply('Sorry, there was an error processing your request.');
      }
    } finally {
      // Reset flag setelah proses selesai
      isProcessing = false;
    }
  }
});

// Login bot menggunakan token
client.login(BOT_TOKEN);
