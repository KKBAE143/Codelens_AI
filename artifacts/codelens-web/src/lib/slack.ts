export interface SlackMessage {
  type: "course_generated" | "course_assigned" | "course_completed";
  text: string;
  blocks?: SlackBlock[];
}

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  elements?: { type: string; text: string }[];
  fields?: { type: string; text: string }[];
}

export async function sendSlackNotification(
  webhookUrl: string,
  message: SlackMessage
): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: message.text,
        blocks: message.blocks,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function courseGeneratedMessage(
  repo: string,
  audience: string,
  userName: string
): SlackMessage {
  return {
    type: "course_generated",
    text: `New course generated: ${repo} (for ${audience}) by ${userName}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:mortar_board: *New course generated*\n*${repo}* (for ${audience}) by ${userName}`,
        },
      },
    ],
  };
}

export function courseAssignedMessage(
  repo: string,
  managerName: string,
  memberName: string,
  dueDate?: string
): SlackMessage {
  const duePart = dueDate ? ` — due ${dueDate}` : "";
  return {
    type: "course_assigned",
    text: `${managerName} assigned ${repo} course to ${memberName}${duePart}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:books: *${managerName}* assigned *${repo}* course to *${memberName}*${duePart}`,
        },
      },
    ],
  };
}

export function courseCompletedMessage(
  repo: string,
  memberName: string
): SlackMessage {
  return {
    type: "course_completed",
    text: `${memberName} completed the ${repo} course!`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:white_check_mark: *${memberName}* completed the *${repo}* course!`,
        },
      },
    ],
  };
}
