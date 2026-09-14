import {
  ChannelMessage,
  ChoiceOption,
  isHttpsUrl,
} from '../../channel/channel.types.js';

const MAX_BODY = 1024;
const MAX_TEXT = 4096;
const MAX_REPLY_BUTTONS = 3;
const MAX_BUTTON_TITLE = 20;
const MAX_BUTTON_ID = 256;
const MAX_LIST_ROWS = 10;
const MAX_LIST_TITLE = 24;
const MAX_LIST_ID = 200;
const MAX_LOCATION_NAME = 100;
const MAX_LOCATION_ADDRESS = 300;
const MAX_FILENAME = 240;

export type WhatsAppIntent =
  | {
      kind: 'text';
      messageId: string;
      from: string;
      phoneNumberId?: string;
      text: string;
    }
  | {
      kind: 'choice';
      messageId: string;
      from: string;
      phoneNumberId?: string;
      buttonId: string;
    };

export function whatsappIntents(body: unknown): WhatsAppIntent[] {
  if (!body || typeof body !== 'object') return [];
  const entry = (body as { entry?: unknown }).entry;
  if (!Array.isArray(entry)) return [];

  const intents: WhatsAppIntent[] = [];
  for (const item of entry) {
    const changes = asRecord(item)?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = asRecord(asRecord(change)?.value);
      const phoneNumberId = stringField(
        asRecord(value?.metadata),
        'phone_number_id',
      );
      const messages = value?.messages;
      if (!Array.isArray(messages)) continue;
      for (const message of messages) {
        const intent = intentFrom(message, phoneNumberId);
        if (intent) intents.push(intent);
      }
    }
  }
  return intents;
}

export type WhatsAppMediaType = 'image' | 'video' | 'audio' | 'document';

export type WhatsAppOutbound =
  | { kind: 'text'; to: string; body: string }
  | {
      kind: 'buttons';
      to: string;
      bodyText: string;
      buttons: Array<{ id: string; title: string }>;
    }
  | {
      kind: 'list';
      to: string;
      bodyText: string;
      buttonText: string;
      sections: Array<{
        title: string;
        rows: Array<{ id: string; title: string }>;
      }>;
    }
  | {
      kind: 'media';
      to: string;
      mediaType: WhatsAppMediaType;
      link: string;
      caption?: string;
      filename?: string;
    }
  | {
      kind: 'location';
      to: string;
      latitude: number;
      longitude: number;
      name?: string;
      address?: string;
    };

export function toWhatsAppOutbounds(
  to: string,
  message: Pick<ChannelMessage, 'kind' | 'payload'>,
): WhatsAppOutbound[] {
  if (message.kind === 'media') return mediaOutbounds(to, message.payload);
  const outbound = toWhatsAppOutbound(to, message);
  return outbound ? [outbound] : [];
}

export function toWhatsAppOutbound(
  to: string,
  message: Pick<ChannelMessage, 'kind' | 'payload'>,
): WhatsAppOutbound | undefined {
  if (message.kind === 'media') return mediaOutbounds(to, message.payload)[0];
  if (message.kind === 'location') return locationOutbound(to, message.payload);
  if (message.kind === 'text') {
    const text = message.payload.text;
    if (typeof text !== 'string' || !text.trim()) return undefined;
    return { kind: 'text', to, body: toWhatsAppMarkup(text) };
  }

  const prompt =
    typeof message.payload.prompt === 'string' ? message.payload.prompt : '';
  const options = choiceOptions(message.payload.options);
  if (!prompt || options.length < 2) return undefined;
  const bodyText = fit(toWhatsAppMarkup(prompt), MAX_BODY);

  if (options.length <= MAX_REPLY_BUTTONS) {
    return {
      kind: 'buttons',
      to,
      bodyText,
      buttons: options.map((option) => ({
        id: option.id.slice(0, MAX_BUTTON_ID),
        title: fit(option.title, MAX_BUTTON_TITLE),
      })),
    };
  }

  return {
    kind: 'list',
    to,
    bodyText,
    buttonText: 'Elegir',
    sections: [
      {
        title: 'Opciones',
        rows: options.slice(0, MAX_LIST_ROWS).map((option) => ({
          id: option.id.slice(0, MAX_LIST_ID),
          title: fit(option.title, MAX_LIST_TITLE),
        })),
      },
    ],
  };
}

function intentFrom(
  message: unknown,
  phoneNumberId: string | undefined,
): WhatsAppIntent | undefined {
  const record = asRecord(message);
  const messageId = stringField(record, 'id');
  const from = stringField(record, 'from');
  if (!record || !messageId || !from) return undefined;

  if (record.type === 'text') {
    const text = stringField(asRecord(record.text), 'body');
    if (!text) return undefined;
    return { kind: 'text', messageId, from, phoneNumberId, text };
  }

  if (record.type === 'interactive') {
    const interactive = asRecord(record.interactive);
    const reply =
      asRecord(interactive?.button_reply) ?? asRecord(interactive?.list_reply);
    const buttonId = stringField(reply, 'id');
    if (!buttonId) return undefined;
    return { kind: 'choice', messageId, from, phoneNumberId, buttonId };
  }

  const text = inboundPlaceholder(record);
  if (!text) return undefined;
  return { kind: 'text', messageId, from, phoneNumberId, text };
}

function inboundPlaceholder(
  record: Record<string, unknown>,
): string | undefined {
  switch (record.type) {
    case 'image':
      return stringField(asRecord(record.image), 'caption') ?? '[Image]';
    case 'video':
      return stringField(asRecord(record.video), 'caption') ?? '[Video]';
    case 'audio':
      return stringField(asRecord(record.audio), 'caption') ?? '[Audio message]';
    case 'voice':
      return '[Voice message]';
    case 'document': {
      const document = asRecord(record.document);
      return (
        stringField(document, 'caption') ??
        `[Document: ${stringField(document, 'filename') ?? 'file'}]`
      );
    }
    case 'sticker':
      return '[Sticker]';
    case 'location':
      return locationPlaceholder(asRecord(record.location));
    default:
      return undefined;
  }
}

function locationPlaceholder(
  location: Record<string, unknown> | undefined,
): string {
  const latitude = numberField(location, 'latitude');
  const longitude = numberField(location, 'longitude');
  if (latitude === undefined || longitude === undefined) return '[Location]';
  const name = stringField(location, 'name');
  const address = stringField(location, 'address');
  const head = name
    ? `[Location: ${name}`
    : `[Location: ${latitude}, ${longitude}`;
  return address ? `${head} - ${address}]` : `${head}]`;
}

function mediaOutbounds(
  to: string,
  payload: Record<string, unknown>,
): WhatsAppOutbound[] {
  const url = payload.url;
  const mimeType = payload.mimeType;
  if (typeof url !== 'string' || !isHttpsUrl(url)) return [];
  if (typeof mimeType !== 'string' || !mimeType.trim()) return [];
  const mediaType = mimeToWhatsApp(mimeType);
  const caption = optionalText(payload.caption);
  const filename = optionalText(payload.filename)?.slice(0, MAX_FILENAME);
  const markup = caption ? toWhatsAppMarkup(caption) : undefined;
  if (mediaType === 'audio' && markup) {
    return [
      { kind: 'text', to, body: fit(markup, MAX_TEXT) },
      { kind: 'media', to, mediaType, link: url },
    ];
  }
  return [
    {
      kind: 'media',
      to,
      mediaType,
      link: url,
      ...(markup && mediaType !== 'audio'
        ? { caption: fit(markup, MAX_BODY) }
        : {}),
      ...(filename && mediaType === 'document' ? { filename } : {}),
    },
  ];
}

function mimeToWhatsApp(mimeType: string): WhatsAppMediaType {
  const mime = mimeType.toLowerCase().split(';')[0]?.trim() ?? '';
  if (mime === 'image/jpeg' || mime === 'image/png') return 'image';
  if (mime === 'video/mp4' || mime === 'video/3gpp') return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

function locationOutbound(
  to: string,
  payload: Record<string, unknown>,
): WhatsAppOutbound | undefined {
  const latitude = numberField(payload, 'latitude');
  const longitude = numberField(payload, 'longitude');
  if (latitude === undefined || longitude === undefined) return undefined;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return undefined;
  }
  const name = optionalText(payload.name);
  const address = optionalText(payload.address);
  return {
    kind: 'location',
    to,
    latitude,
    longitude,
    ...(name ? { name: fit(name, MAX_LOCATION_NAME) } : {}),
    ...(address ? { address: fit(address, MAX_LOCATION_ADDRESS) } : {}),
  };
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

const FENCE_PLACEHOLDER = '\uE000';

export function toWhatsAppMarkup(text: string): string {
  const fences: string[] = [];
  const protectedText = text.replace(/```[\s\S]*?```/g, (match) => {
    fences.push(match);
    return `${FENCE_PLACEHOLDER}${fences.length - 1}${FENCE_PLACEHOLDER}`;
  });
  const converted = protectedText
    .replace(/^(#{1,6})[ \t]+(.+)$/gm, (_match, _hashes, title: string) =>
      headingToBold(title),
    )
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/__(.+?)__/g, '*$1*')
    .replace(/~~(.+?)~~/g, '~$1~');
  return converted.replace(
    new RegExp(`${FENCE_PLACEHOLDER}(\\d+)${FENCE_PLACEHOLDER}`, 'g'),
    (_match, index: string) => fences[Number(index)] ?? '',
  );
}

function headingToBold(title: string): string {
  const cleaned = title.replace(/\*\*/g, '').replace(/__/g, '').trim();
  if (!cleaned) return title;
  return `*${cleaned}*`;
}

function fit(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 1) return text.slice(0, max);
  return `${text.slice(0, max - 1)}…`;
}

function choiceOptions(value: unknown): ChoiceOption[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (option): option is ChoiceOption =>
      Boolean(option) &&
      typeof option === 'object' &&
      typeof (option as ChoiceOption).id === 'string' &&
      typeof (option as ChoiceOption).title === 'string',
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  return value as Record<string, unknown>;
}

function stringField(
  record: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' && value ? value : undefined;
}

function numberField(
  record: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
