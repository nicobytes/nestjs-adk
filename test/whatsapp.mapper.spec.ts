import { createHmac } from 'node:crypto';
import {
  toWhatsAppMarkup,
  toWhatsAppOutbound,
  toWhatsAppOutbounds,
  whatsappIntents,
} from '../src/adapters/whatsapp/whatsapp.mapper.js';
import { whatsappSignatureOk } from '../src/adapters/whatsapp/whatsapp.signature.js';
import { describe, expect, it } from 'vitest';

describe('whatsapp mapper', () => {
  it('reads text and button replies and ignores statuses', () => {
    expect(
      whatsappIntents({
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: 'phone-id' },
                  statuses: [{ id: 'status-1', status: 'delivered' }],
                  messages: [
                    {
                      id: 'wamid.1',
                      from: '5215512345678',
                      type: 'text',
                      text: { body: 'pregúntame A o B' },
                    },
                    {
                      id: 'wamid.2',
                      from: '5215512345678',
                      type: 'interactive',
                      interactive: {
                        type: 'button_reply',
                        button_reply: { id: 'b', title: 'B' },
                      },
                    },
                    {
                      id: 'wamid.3',
                      from: '5215512345678',
                      type: 'image',
                    },
                    {
                      id: 'wamid.system',
                      from: '5215512345678',
                      type: 'system',
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
    ).toEqual([
      {
        kind: 'text',
        messageId: 'wamid.1',
        from: '5215512345678',
        phoneNumberId: 'phone-id',
        text: 'pregúntame A o B',
      },
      {
        kind: 'choice',
        messageId: 'wamid.2',
        from: '5215512345678',
        phoneNumberId: 'phone-id',
        buttonId: 'b',
      },
      {
        kind: 'text',
        messageId: 'wamid.3',
        from: '5215512345678',
        phoneNumberId: 'phone-id',
        text: '[Image]',
      },
    ]);
  });

  it('reads list replies', () => {
    expect(
      whatsappIntents({
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: 'wamid.4',
                      from: '52155',
                      type: 'interactive',
                      interactive: {
                        type: 'list_reply',
                        list_reply: { id: 'c', title: 'C' },
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      }),
    ).toEqual([
      {
        kind: 'choice',
        messageId: 'wamid.4',
        from: '52155',
        phoneNumberId: undefined,
        buttonId: 'c',
      },
    ]);
  });

  it('turns inbound media and location into placeholders', () => {
    expect(
      whatsappIntents({
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: 'wamid.img',
                      from: '52155',
                      type: 'image',
                      image: { caption: 'the lobby' },
                    },
                    {
                      id: 'wamid.vid',
                      from: '52155',
                      type: 'video',
                    },
                    {
                      id: 'wamid.doc',
                      from: '52155',
                      type: 'document',
                      document: { filename: 'menu.pdf' },
                    },
                    {
                      id: 'wamid.pin',
                      from: '52155',
                      type: 'location',
                      location: {
                        latitude: -19.04,
                        longitude: -65.24,
                        name: 'HQ',
                        address: '1 Main',
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      }).map((intent) => intent.kind === 'text' ? intent.text : intent.kind),
    ).toEqual([
      'the lobby',
      '[Video]',
      '[Document: menu.pdf]',
      '[Location: HQ - 1 Main]',
    ]);
  });

  it('maps mime types, drops non-https links, and splits audio captions', () => {
    expect(
      toWhatsAppOutbounds('52155', {
        kind: 'media',
        payload: {
          url: 'https://cdn.example/photo.jpg',
          mimeType: 'image/jpeg; charset=binary',
          caption: 'Lobby',
        },
      }),
    ).toEqual([
      {
        kind: 'media',
        to: '52155',
        mediaType: 'image',
        link: 'https://cdn.example/photo.jpg',
        caption: 'Lobby',
      },
    ]);

    expect(
      toWhatsAppOutbounds('52155', {
        kind: 'media',
        payload: {
          url: 'https://cdn.example/clip.gif',
          mimeType: 'image/gif',
          filename: 'clip.gif',
        },
      }),
    ).toEqual([
      {
        kind: 'media',
        to: '52155',
        mediaType: 'document',
        link: 'https://cdn.example/clip.gif',
        filename: 'clip.gif',
      },
    ]);

    expect(
      toWhatsAppOutbounds('52155', {
        kind: 'media',
        payload: {
          url: 'http://cdn.example/nope.jpg',
          mimeType: 'image/jpeg',
        },
      }),
    ).toEqual([]);

    expect(
      toWhatsAppOutbounds('52155', {
        kind: 'media',
        payload: {
          url: 'https://cdn.example/note.mp3',
          mimeType: 'audio/mpeg',
          caption: 'listen',
        },
      }),
    ).toEqual([
      { kind: 'text', to: '52155', body: 'listen' },
      {
        kind: 'media',
        to: '52155',
        mediaType: 'audio',
        link: 'https://cdn.example/note.mp3',
      },
    ]);
  });

  it('maps a location pin and rejects out-of-range coordinates', () => {
    expect(
      toWhatsAppOutbound('52155', {
        kind: 'location',
        payload: {
          latitude: -19.04,
          longitude: -65.24,
          name: 'HQ',
          address: '1 Main',
        },
      }),
    ).toEqual({
      kind: 'location',
      to: '52155',
      latitude: -19.04,
      longitude: -65.24,
      name: 'HQ',
      address: '1 Main',
    });
    expect(
      toWhatsAppOutbound('52155', {
        kind: 'location',
        payload: { latitude: 91, longitude: 0 },
      }),
    ).toBeUndefined();
  });

  it('builds reply buttons for two options and a list for four', () => {
    expect(
      toWhatsAppOutbound('52155', {
        kind: 'buttons',
        payload: {
          prompt: 'pick',
          options: [
            { id: 'a', title: 'A' },
            { id: 'b', title: 'B' },
          ],
        },
      }),
    ).toEqual({
      kind: 'buttons',
      to: '52155',
      bodyText: 'pick',
      buttons: [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
      ],
    });

    const list = toWhatsAppOutbound('52155', {
      kind: 'buttons',
      payload: {
        prompt: 'pick',
        options: [
          { id: 'a', title: 'A' },
          { id: 'b', title: 'B' },
          { id: 'c', title: 'C' },
          { id: 'd', title: 'D' },
        ],
      },
    });
    expect(list?.kind).toBe('list');
    if (list?.kind !== 'list') return;
    expect(list.buttonText).toBe('Elegir');
    expect(list.sections[0]?.rows).toHaveLength(4);
  });

  it('truncates titles with an ellipsis and caps lists at 10 rows', () => {
    const buttons = toWhatsAppOutbound('52155', {
      kind: 'buttons',
      payload: {
        prompt: 'p'.repeat(1025),
        options: [
          { id: 'a', title: 'abcdefghijklmnopqrstuvwxyz' },
          { id: 'b', title: 'B' },
        ],
      },
    });
    expect(buttons?.kind).toBe('buttons');
    if (buttons?.kind !== 'buttons') return;
    expect(buttons.bodyText).toHaveLength(1024);
    expect(buttons.bodyText.endsWith('…')).toBe(true);
    expect(buttons.buttons[0]?.title).toBe('abcdefghijklmnopqrs…');

    const options = Array.from({ length: 12 }, (_, index) => ({
      id: `id-${index}`,
      title: `option-${index}-with-a-very-long-title`,
    }));
    const list = toWhatsAppOutbound('52155', {
      kind: 'buttons',
      payload: { prompt: 'pick', options },
    });
    expect(list?.kind).toBe('list');
    if (list?.kind !== 'list') return;
    const rows = list.sections[0]?.rows ?? [];
    expect(rows).toHaveLength(10);
    expect(rows[0]?.title).toHaveLength(24);
    expect(rows[0]?.title.endsWith('…')).toBe(true);
  });

  it('converts commonmark to whatsapp markup on text and button prompts', () => {
    expect(
      toWhatsAppOutbound('52155', {
        kind: 'text',
        payload: { text: 'The best sushi is at **Jin Sho**.' },
      }),
    ).toEqual({
      kind: 'text',
      to: '52155',
      body: 'The best sushi is at *Jin Sho*.',
    });

    const buttons = toWhatsAppOutbound('52155', {
      kind: 'buttons',
      payload: {
        prompt: 'Pick **one**',
        options: [
          { id: 'a', title: '**Keep**' },
          { id: 'b', title: 'B' },
        ],
      },
    });
    expect(buttons).toEqual({
      kind: 'buttons',
      to: '52155',
      bodyText: 'Pick *one*',
      buttons: [
        { id: 'a', title: '**Keep**' },
        { id: 'b', title: 'B' },
      ],
    });
  });

  it('converts strike and underscore bold, and leaves italic', () => {
    expect(toWhatsAppMarkup('Use __bold__ and ~~nope~~, keep _note_.')).toBe(
      'Use *bold* and ~nope~, keep _note_.',
    );
  });

  it('turns headings into bold and preserves fenced code', () => {
    expect(toWhatsAppMarkup('# Morning\n## Afternoon')).toBe(
      '*Morning*\n*Afternoon*',
    );
    expect(toWhatsAppMarkup('# **Jin Sho**')).toBe('*Jin Sho*');
    expect(toWhatsAppMarkup('See **this** and ```**not bold**```.')).toBe(
      'See *this* and ```**not bold**```.',
    );
  });

  it('truncates the body after converting markup', () => {
    const prompt = `**${'p'.repeat(1023)}**`;
    const buttons = toWhatsAppOutbound('52155', {
      kind: 'buttons',
      payload: {
        prompt,
        options: [
          { id: 'a', title: 'A' },
          { id: 'b', title: 'B' },
        ],
      },
    });
    expect(buttons?.kind).toBe('buttons');
    if (buttons?.kind !== 'buttons') return;
    expect(prompt.length).toBeGreaterThan(1024);
    expect(buttons.bodyText).toHaveLength(1024);
    expect(buttons.bodyText.endsWith('…')).toBe(true);
    expect(buttons.bodyText.includes('**')).toBe(false);
    expect(buttons.bodyText.startsWith('*')).toBe(true);
  });
});

describe('whatsapp signature', () => {
  it('accepts a matching sha256 header', () => {
    const body = Buffer.from('{"ok":true}');
    const header = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`;
    expect(whatsappSignatureOk(body, header, 'secret')).toBe(true);
    expect(whatsappSignatureOk(body, header, 'other')).toBe(false);
  });
});
