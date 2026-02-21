import 'dotenv/config';
import {
  ChannelType,
  Client,
  Colors,
  EmbedBuilder,
  GatewayIntentBits,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { getRoleIds, getSetting, listStaff, setRoleIds, setSetting, upsertStaff } from './db.js';

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error('DISCORD_TOKEN is missing');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

function embed(title, description, color = Colors.Blurple) {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setTimestamp();
}

function memberHasConfiguredRole(member, scope) {
  const ids = new Set(getRoleIds(scope));
  return member.roles.cache.some((r) => ids.has(r.id));
}

function isAdmin(member) {
  return member.permissions.has(PermissionFlagsBits.Administrator) || memberHasConfiguredRole(member, 'admin');
}

function isStaff(member) {
  return isAdmin(member) || memberHasConfiguredRole(member, 'staff');
}

function roleResponse(scope, ids, guild) {
  if (!ids.length) return embed('Roles', `No ${scope} roles configured yet.`, Colors.Orange);
  const names = ids.map((id) => guild.roles.cache.get(id)?.toString() || `\`${id}\``).join('\n');
  return embed('Roles', `Configured **${scope}** roles:\n${names}`, Colors.Green);
}

const commands = [
  new SlashCommandBuilder()
    .setName('roles')
    .setDescription('Add/remove/list staff or admin roles')
    .addStringOption((o) =>
      o.setName('scope').setDescription('Role scope').setRequired(true).addChoices({ name: 'staff', value: 'staff' }, { name: 'admin', value: 'admin' })
    )
    .addStringOption((o) =>
      o.setName('action').setDescription('Action').setRequired(true).addChoices({ name: 'add', value: 'add' }, { name: 'remove', value: 'remove' }, { name: 'list', value: 'list' })
    )
    .addRoleOption((o) => o.setName('role').setDescription('Role to add/remove')),

  new SlashCommandBuilder()
    .setName('setchannel')
    .setDescription('Set a destination channel')
    .addStringOption((o) =>
      o.setName('kind').setDescription('Channel usage').setRequired(true).addChoices(
        { name: 'logs', value: 'logs' },
        { name: 'staff_updates', value: 'staff_updates' },
        { name: 'punishments', value: 'punishments' }
      )
    )
    .addChannelOption((o) => o.setName('channel').setDescription('Target channel').addChannelTypes(ChannelType.GuildText).setRequired(true)),

  new SlashCommandBuilder()
    .setName('setstaff')
    .setDescription('Set staff profile')
    .addUserOption((o) => o.setName('user').setDescription('Staff member').setRequired(true))
    .addStringOption((o) => o.setName('rank').setDescription('Rank').setRequired(true))
    .addRoleOption((o) => o.setName('role').setDescription('Primary role').setRequired(true))
    .addStringOption((o) => o.setName('hire_date').setDescription('Hire date text').setRequired(true)),

  new SlashCommandBuilder().setName('stafflist').setDescription('Show staff list with rank'),
  new SlashCommandBuilder().setName('usercount').setDescription('Show server user count'),
  new SlashCommandBuilder().setName('nitrocount').setDescription('Show server nitro boost count'),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user')
    .addUserOption((o) => o.setName('user').setDescription('Target').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason')),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user')
    .addUserOption((o) => o.setName('user').setDescription('Target').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason')),

  new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Timeout a user')
    .addUserOption((o) => o.setName('user').setDescription('Target').setRequired(true))
    .addIntegerOption((o) => o.setName('minutes').setDescription('Minutes').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Reason')),

  new SlashCommandBuilder()
    .setName('sendembed')
    .setDescription('Send a custom embed to a channel')
    .addChannelOption((o) => o.setName('channel').setDescription('Destination').addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption((o) => o.setName('title').setDescription('Embed title').setRequired(true))
    .addStringOption((o) => o.setName('description').setDescription('Embed description').setRequired(true)),

  new SlashCommandBuilder()
    .setName('staffupdate')
    .setDescription('Send staff update embed')
    .addStringOption((o) =>
      o.setName('action').setDescription('Update action').setRequired(true).addChoices(
        { name: 'promotion', value: 'promotion' },
        { name: 'demotion', value: 'demotion' },
        { name: 'hire', value: 'hire' },
        { name: 'kick', value: 'kick' }
      )
    )
    .addUserOption((o) => o.setName('user').setDescription('Staff member').setRequired(true))
    .addStringOption((o) => o.setName('details').setDescription('Details').setRequired(true)),
].map((c) => c.toJSON());

async function sendLog(guild, message) {
  const id = getSettingByKind('logs');
  if (!id) return;
  const channel = guild.channels.cache.get(id);
  if (!channel) return;
  await channel.send({ embeds: [embed('Log', message)] });
}

function getSettingByKind(kind) {
  const map = { logs: 'log_channel_id', staff_updates: 'staff_updates_channel_id', punishments: 'punishment_channel_id' };
  return getSetting(map[kind]);
}

client.once('ready', async () => {
  await client.application.commands.set(commands);
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() || !interaction.inGuild()) return;

  const member = interaction.member;

  const deny = (text = 'You do not have permission for this command.') =>
    interaction.reply({ embeds: [embed('Permission denied', text, Colors.Red)], ephemeral: true });

  try {
    if (interaction.commandName === 'roles') {
      if (!isAdmin(member)) return deny('Administrator only.');
      const scope = interaction.options.getString('scope', true);
      const action = interaction.options.getString('action', true);
      const role = interaction.options.getRole('role');

      const ids = getRoleIds(scope);
      if (action === 'list') {
        return interaction.reply({ embeds: [roleResponse(scope, ids, interaction.guild)], ephemeral: true });
      }
      if (!role) {
        return interaction.reply({ embeds: [embed('Missing role', 'You must provide a role for add/remove.', Colors.Orange)], ephemeral: true });
      }
      const next = new Set(ids);
      if (action === 'add') next.add(role.id);
      if (action === 'remove') next.delete(role.id);
      setRoleIds(scope, [...next]);

      return interaction.reply({ embeds: [embed('Roles updated', `${scope} role ${action}ed: ${role}`, Colors.Green)], ephemeral: true });
    }

    if (interaction.commandName === 'setchannel') {
      if (!isAdmin(member)) return deny('Administrator only.');
      const kind = interaction.options.getString('kind', true);
      const channel = interaction.options.getChannel('channel', true);
      const map = { logs: 'log_channel_id', staff_updates: 'staff_updates_channel_id', punishments: 'punishment_channel_id' };
      setSetting(map[kind], channel.id);
      return interaction.reply({ embeds: [embed('Channel configured', `Set **${kind}** to ${channel}.`, Colors.Green)], ephemeral: true });
    }

    if (interaction.commandName === 'setstaff') {
      if (!isAdmin(member)) return deny('Administrator only.');
      const user = interaction.options.getUser('user', true);
      const rank = interaction.options.getString('rank', true);
      const role = interaction.options.getRole('role', true);
      const hireDate = interaction.options.getString('hire_date', true);
      upsertStaff({ userId: user.id, rank, roleId: role.id, hireDate });
      return interaction.reply({ embeds: [embed('Staff updated', `${user} → **${rank}** (${role}) | Hire: ${hireDate}`, Colors.Green)] });
    }

    if (interaction.commandName === 'stafflist') {
      if (!isStaff(member)) return deny('Staff only.');
      const rows = listStaff();
      if (!rows.length) {
        return interaction.reply({ embeds: [embed('Staff list', 'No staff records yet.', Colors.Orange)] });
      }
      const lines = rows.map((r) => `• <@${r.user_id}> — **${r.rank ?? 'N/A'}** | Hire: \`${r.hire_date ?? 'N/A'}\``);
      return interaction.reply({ embeds: [embed('Staff List', lines.join('\n'), Colors.Blue)] });
    }

    if (interaction.commandName === 'usercount') {
      return interaction.reply({ embeds: [embed('User Count', `Members: **${interaction.guild.memberCount}**`, Colors.Blue)] });
    }

    if (interaction.commandName === 'nitrocount') {
      return interaction.reply({ embeds: [embed('Nitro Count', `Boosts: **${interaction.guild.premiumSubscriptionCount ?? 0}**`, Colors.Blue)] });
    }

    if (['kick', 'ban', 'timeout', 'sendembed', 'staffupdate'].includes(interaction.commandName) && !isAdmin(member)) {
      return deny('Administrator only.');
    }

    if (interaction.commandName === 'kick') {
      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const target = await interaction.guild.members.fetch(user.id);
      await target.kick(reason);
      await interaction.reply({ embeds: [embed('User kicked', `${user} was kicked.\nReason: ${reason}`, Colors.Red)] });
      await sendLog(interaction.guild, `${interaction.user.tag} kicked ${user.tag}. Reason: ${reason}`);
    }

    if (interaction.commandName === 'ban') {
      const user = interaction.options.getUser('user', true);
      const reason = interaction.options.getString('reason') || 'No reason provided';
      await interaction.guild.members.ban(user.id, { reason });
      await interaction.reply({ embeds: [embed('User banned', `${user} was banned.\nReason: ${reason}`, Colors.Red)] });
      await sendLog(interaction.guild, `${interaction.user.tag} banned ${user.tag}. Reason: ${reason}`);
    }

    if (interaction.commandName === 'timeout') {
      const user = interaction.options.getUser('user', true);
      const minutes = interaction.options.getInteger('minutes', true);
      const reason = interaction.options.getString('reason') || 'No reason provided';
      const target = await interaction.guild.members.fetch(user.id);
      await target.timeout(minutes * 60 * 1000, reason);
      await interaction.reply({ embeds: [embed('User timeout', `${user} timed out for **${minutes}** minutes.\nReason: ${reason}`, Colors.Red)] });
      await sendLog(interaction.guild, `${interaction.user.tag} timed out ${user.tag} for ${minutes}m. Reason: ${reason}`);
    }

    if (interaction.commandName === 'sendembed') {
      const channel = interaction.options.getChannel('channel', true);
      const title = interaction.options.getString('title', true);
      const description = interaction.options.getString('description', true);
      await channel.send({ embeds: [embed(title, description, Colors.Gold)] });
      return interaction.reply({ embeds: [embed('Embed sent', `Sent to ${channel}.`, Colors.Green)], ephemeral: true });
    }

    if (interaction.commandName === 'staffupdate') {
      const action = interaction.options.getString('action', true);
      const user = interaction.options.getUser('user', true);
      const details = interaction.options.getString('details', true);
      const channelId = getSettingByKind('staff_updates');
      if (!channelId) {
        return interaction.reply({ embeds: [embed('Not configured', 'Set staff_updates channel first with /setchannel.', Colors.Orange)], ephemeral: true });
      }
      const channel = interaction.guild.channels.cache.get(channelId);
      if (!channel) {
        return interaction.reply({ embeds: [embed('Missing channel', 'Configured staff_updates channel was not found.', Colors.Red)], ephemeral: true });
      }
      await channel.send({
        embeds: [
          embed(`Staff ${action}`, `Member: ${user}\nDetails: ${details}\nBy: ${interaction.user}`, Colors.Aqua),
        ],
      });
      await interaction.reply({ embeds: [embed('Staff update sent', `Posted **${action}** update for ${user}.`, Colors.Green)], ephemeral: true });
    }
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [embed('Error', 'Something went wrong while running this command.', Colors.Red)], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [embed('Error', 'Something went wrong while running this command.', Colors.Red)], ephemeral: true });
    }
  }
});

client.login(token);
