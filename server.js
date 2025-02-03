import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Client, GatewayIntentBits } from 'discord.js';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions
  ]
});

const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const PORT = process.env.PORT || 3000;
const STATS_FILE = process.env.STATS_FILE_PATH || './userStats.json';
const WINNERS_STATS_FILE = path.resolve('./freakWinners.json');
const REACTIONS_STATS_FILE = path.resolve('./reactionsStats.json');

let reactionStats = {};
let userStats = {};
let freakWinners = {};

if (fs.existsSync(STATS_FILE)) {
  userStats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8'));
}

if (fs.existsSync(WINNERS_STATS_FILE)) {
  freakWinners = JSON.parse(fs.readFileSync(WINNERS_STATS_FILE, 'utf8'));
}

if (fs.existsSync(REACTIONS_STATS_FILE)) {
  reactionStats = JSON.parse(fs.readFileSync(REACTIONS_STATS_FILE, 'utf8'));
}

client.login(process.env.DISCORD_TOKEN);

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Функція для відправлення повідомлення
async function sendMessageToChannel(username) {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const channel = await guild.channels.fetch(CHANNEL_ID);

    if (channel && channel.isTextBased()) {
      await channel.send(`🎉 Фрік дня: **${username}**! Вітаємо, єбать ти фрікаделька! 🚷`);
      console.log('Повідомлення відправлено');
    } else {
      console.error('Канал не знайдено або це не текстовий канал.');
    }
  } catch (error) {
    console.error('Помилка відправлення повідомлення:', error);
  }
}

// Збирання статистики повідомлень
client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  const userId = message.author.id;
  const currentDate = new Date().toISOString().split('T')[0];

  // Якщо користувача немає в статистиці, додаємо його
  if (!userStats[userId]) {
    userStats[userId] = {
      username: message.author.username,
      avatar: message.author.displayAvatarURL(),
      messages: {}
    };
  }

  // Оновлюємо статистику для конкретної дати
  if (!userStats[userId].messages[currentDate]) {
    userStats[userId].messages[currentDate] = 0;
  }

  userStats[userId].messages[currentDate] += 1;

  // Зберігаємо статистику у файл
  fs.writeFileSync(STATS_FILE, JSON.stringify(userStats, null, 2));
});

// API для отримання статистики користувачів
app.get('/api/user-stats', (req, res) => {
  res.status(200).json(userStats);
});

// Обробка додавання реакцій
client.on('messageReactionAdd', (reaction) => {
  const emoji = reaction.emoji;

  // Створюємо ключ реакції у форматі `ім'я:ід`, щоб уникнути конфліктів
  const reactionKey = emoji.id ? `${emoji.name}:${emoji.id}` : emoji.name;

  if (!reactionStats[reactionKey]) {
    reactionStats[reactionKey] = {
      name: emoji.name,
      imageUrl: emoji.url || emoji.toString(), // URL або текстове представлення емодзі
      count: 0
    };
  }

  reactionStats[reactionKey].count += 1;

  // Зберігаємо статистику у файл
  fs.writeFileSync(REACTIONS_STATS_FILE, JSON.stringify(reactionStats, null, 2));
});

app.get('/api/reactions-stats', (req, res) => {
  res.status(200).json(reactionStats);
});

// Маршрут для отримання списку учасників сервера
app.get('/api/members', async (req, res) => {
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const members = await guild.members.fetch();

    const filtredMembers = members.filter(member => member.user.bot === false);
    const membersData = filtredMembers.map(member => ({
      id: member.id,
      username: member.user.username,
      avatar: member.user.displayAvatarURL(),
      role: member.roles.highest.name,
    }));

    res.status(200).json(membersData);
  } catch (error) {
    console.error('Помилка отримання учасників:', error);
    res.status(500).send('Помилка сервера.');
  }
});

client.on('messageCreate', (message) => {
  // Ігноруємо повідомлення від самого бота
  if (message.author.bot) return;

  // **Перевірка на ключові слова**
  if (message.content.toLowerCase().includes('фрік') || message.content.toLowerCase().includes('fr1kadelka') || message.content.toLowerCase().includes('даун')) {
    // Додаємо емодзі-реакцію
    message.react('🤡');

    // Відповідаємо на повідомлення (опціонально)
    message.reply('Може таки тегним головного по фріковсту fr1kadelka🤡🤡🤡🤡?');
  }

});

// Маршрут для додавання нового переможця
app.post('/api/add-winner', (req, res) => {
  const { userId, username } = req.body;

  if (!userId || !username) {
    return res.status(400).send('Недостатньо даних.');
  }

  // Оновлення статистики
  if (!freakWinners[userId]) {
    freakWinners[userId] = { username, count: 0 };
  }

  freakWinners[userId].count += 1;

  // Зберігаємо статистику у файл
  fs.writeFileSync(WINNERS_STATS_FILE, JSON.stringify(freakWinners, null, 2));

  res.status(200).send('Переможець доданий до статистики.');
});

// Маршрут для отримання статистики переможців
app.get('/api/freak-stats', (req, res) => {
  res.status(200).json(freakWinners);
});

// Маршрут для обрання переможця та відправлення повідомлення
app.post('/api/roulette', async (req, res) => {
  try {
    const { winner } = req.body;

    if (!winner || !winner.username) {
      return res.status(400).send('Недостатньо даних для відправлення повідомлення.');
    }

    // Відправлення повідомлення в канал
    await sendMessageToChannel(winner.username);
    res.status(200).send('Повідомлення успішно відправлено.');
  } catch (error) {
    console.error('Помилка запуску рулетки:', error);
    res.status(500).send('Помилка сервера.');
  }
});

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
});
