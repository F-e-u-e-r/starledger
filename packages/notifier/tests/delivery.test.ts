import { describe, expect, it } from 'vitest';
import { processPendingNotifications } from '../src/run';
import { notificationKey } from '../src/models';
import {
  makeConfig,
  makeDelivery,
  makePending,
  makeResolvedRepository,
  FakeRepositoryResolver,
  FakeTelegramSender,
  makeState,
} from './helpers';

const NOW = new Date('2026-06-19T12:00:00Z');

describe('processPendingNotifications', () => {
  it('marks an item skipped_no_repo when it contains no valid GitHub candidate', async () => {
    const item = makePending({ item: makePending().item });
    item.item.extraction_text = 'No repository link here';
    const result = await processPendingNotifications(
      makeState({ pending: [item] }),
      {
        resolver: new FakeRepositoryResolver(() => []),
        summaryProvider: {
          async summarize() {
            return { title: 'unused', body: 'unused' };
          },
        },
        telegramSender: new FakeTelegramSender(),
      },
      makeConfig(),
      NOW,
    );

    expect(result.errors).toEqual([]);
    expect(result.state.pending).toEqual([]);
    expect(result.state.deliveries).toEqual([
      expect.objectContaining({
        notification_key: 'youtube:VIDEO1',
        status: 'skipped_no_repo',
      }),
    ]);
  });

  it('records only successful sends and keeps the item pending after a later send fails', async () => {
    const item = makePending({
      item: makePending().item,
    });
    item.item.extraction_text = 'https://github.com/acme/one https://github.com/acme/two';
    const repoA = makeResolvedRepository({ node_id: 'R_a', name_with_owner: 'acme/one' });
    const repoB = makeResolvedRepository({ node_id: 'R_b', name_with_owner: 'acme/two' });
    let sends = 0;
    const result = await processPendingNotifications(
      makeState({ pending: [item] }),
      {
        resolver: new FakeRepositoryResolver(() => [repoA, repoB]),
        summaryProvider: {
          async summarize(repository) {
            return { title: repository.name_with_owner, body: 'summary' };
          },
        },
        telegramSender: new FakeTelegramSender(() => {
          sends += 1;
          if (sends === 2) throw new Error('Telegram 503');
        }),
      },
      makeConfig(),
      NOW,
    );

    expect(result.errors).toEqual([
      expect.objectContaining({ source: 'telegram', target: 'youtube:VIDEO1' }),
    ]);
    expect(result.state.pending).toEqual([
      expect.objectContaining({ attempts: 1, last_error: expect.stringContaining('Telegram 503') }),
    ]);
    expect(result.state.deliveries).toEqual([
      expect.objectContaining({
        notification_key: notificationKey('youtube', 'VIDEO1', 'R_a'),
        status: 'sent',
      }),
    ]);
  });

  it('replay skips existing sent keys and removes the now-complete pending item', async () => {
    const item = makePending();
    item.item.extraction_text = 'https://github.com/acme/widget';
    const repository = makeResolvedRepository({ node_id: 'R_sent' });
    const sender = new FakeTelegramSender();
    const result = await processPendingNotifications(
      makeState({
        pending: [item],
        deliveries: [
          makeDelivery({
            notification_key: notificationKey('youtube', 'VIDEO1', 'R_sent'),
            status: 'sent',
          }),
        ],
      }),
      {
        resolver: new FakeRepositoryResolver(() => [repository]),
        summaryProvider: {
          async summarize() {
            return { title: 'unused', body: 'unused' };
          },
        },
        telegramSender: sender,
      },
      makeConfig(),
      NOW,
    );

    expect(result.errors).toEqual([]);
    expect(result.state.pending).toEqual([]);
    expect(sender.messages).toEqual([]);
  });

  it('keeps an item pending when repository resolution partially fails', async () => {
    const item = makePending();
    item.item.extraction_text = 'https://github.com/acme/one https://github.com/acme/two';
    const result = await processPendingNotifications(
      makeState({ pending: [item] }),
      {
        resolver: new FakeRepositoryResolver(() => {
          throw new Error('GitHub temporarily unavailable');
        }),
        summaryProvider: {
          async summarize() {
            return { title: 'unused', body: 'unused' };
          },
        },
        telegramSender: new FakeTelegramSender(),
      },
      makeConfig(),
      NOW,
    );

    expect(result.state.pending).toEqual([expect.objectContaining({ attempts: 1 })]);
    expect(result.state.deliveries).toEqual([]);
    expect(result.errors[0]).toEqual(expect.objectContaining({ source: 'resolution' }));
  });
});
