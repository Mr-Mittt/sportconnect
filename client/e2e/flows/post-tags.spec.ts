import { seedAuthenticatedSession } from '../mocks/fixtures.ts';
import { expect, test } from '../mocks/test.ts';

/*
 * CLIENT-GL-50 part 2: tagging in normal posts. A user post (Home Feed) tags the caller's friends (the fixture friend is
 * Priya Shah); a group post tags the group's members (`GET /groups/{id}/members/search`, B23; the fixture group "Weekend
 * Tennis Ladder" has Sam Ito and Alex Chen besides the caller); the comments under a post use the same people as the post.
 * The post box is multi-line (Enter adds a line, the Post button sends). Real caret behaviour is only provable in a
 * browser, so it is proven here, not in Vitest.
 */

test('Home Feed — tag a friend in a post with a line break, then in a comment and a reply (CLIENT-GL-50 part 2)', async ({
  page,
}) => {
  test.setTimeout(90000);
  await seedAuthenticatedSession(page);
  const composer = page.getByRole('textbox', { name: 'Create a post' });
  const friends = page.getByRole('listbox', { name: 'People you can tag' });

  await test.step('1. @ in the post box offers the friends; Enter picks (no line break), Enter after that adds a line', async () => {
    await composer.click();
    await composer.pressSequentially('derby with @shah');
    await expect(friends.getByRole('option', { name: 'Priya Shah' })).toBeVisible();
    await composer.press('Enter');
    await expect(composer.getByRole('img', { name: 'Mention: Priya Shah' })).toBeVisible();
    await expect(composer).toHaveText('derby with @Priya Shah');
    await composer.pressSequentially('#derby');
    await composer.press('Enter');
    await composer.pressSequentially('Court 3 at 7pm');
    await expect(composer).toHaveText(/#derby\s*Court 3 at 7pm/);
    await expect(page.getByRole('article').filter({ hasText: 'Court 3 at 7pm' })).toHaveCount(0);
  });

  await test.step('2. the Post button sends: the post shows the chip, the clickable hashtag and the line break', async () => {
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    const article = page.getByRole('article').first();
    await expect(article).toContainText('Court 3 at 7pm');
    await expect(article.getByRole('img', { name: 'Mention: Priya Shah' })).toBeVisible();
    await expect(article.getByRole('button', { name: '#derby' })).toBeVisible();
    // The id is never shown.
    await expect(article).not.toContainText('@[');
    const text = await article.locator('p').first().innerText();
    expect(text).toMatch(/#derby\s*\nCourt 3 at 7pm/);
    await expect(composer).toHaveText('');
  });

  await test.step('3. a comment under the post tags a friend too, and shows the chip', async () => {
    const article = page.getByRole('article').first();
    await article.getByRole('button', { name: 'View comments' }).click();
    const dialog = page.getByRole('dialog');
    const comment = dialog.getByRole('textbox', { name: 'Add a comment' });
    await comment.click();
    await comment.pressSequentially('see you @pri');
    await expect(dialog.getByRole('listbox', { name: 'People you can tag' }).getByRole('option', { name: 'Priya Shah' })).toBeVisible();
    await comment.press('Enter');
    await expect(comment.getByRole('img', { name: 'Mention: Priya Shah' })).toBeVisible();
    await comment.press('Enter');
    // two chips now: the one in the post body and the one in the new comment
    await expect(dialog.getByRole('img', { name: 'Mention: Priya Shah' })).toHaveCount(2);
    await expect(comment).toHaveText('');
  });

  await test.step('4. a reply can tag as well; Esc closes the list and the next @ starts a new search', async () => {
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Reply' }).first().click();
    const reply = dialog.getByRole('textbox', { name: /Reply to/ });
    await reply.pressSequentially('@shah');
    const list = dialog.getByRole('listbox', { name: 'People you can tag' });
    await expect(list.getByRole('option', { name: 'Priya Shah' })).toBeVisible();
    await reply.press('Escape');
    await expect(list).toHaveCount(0);
    await reply.pressSequentially(' ');
    await reply.pressSequentially('@pri');
    await expect(list.getByRole('option', { name: 'Priya Shah' })).toBeVisible();
  });
});

test('Groups — a group post tags the group members, not friends; its comments tag the members (CLIENT-GL-50 part 2, B23)', async ({
  page,
}) => {
  test.setTimeout(90000);
  await seedAuthenticatedSession(page, '/groups');
  const groupSwitcher = page.getByRole('group', { name: 'Group filter' });
  await groupSwitcher.getByRole('button', { name: /Weekend Tennis Ladder/ }).click();
  const composer = page.getByRole('textbox', { name: 'Create a post' });
  const people = page.getByRole('listbox', { name: 'People you can tag' });

  await test.step('1. @ in the group post box offers members (matched on the start of a name), not the caller\'s friends', async () => {
    await composer.click();
    await composer.pressSequentially('@ito');
    await expect(people.getByRole('option', { name: 'Sam Ito' })).toBeVisible();
    await composer.fill('@priya');
    await expect(people).toHaveCount(0);
    await composer.fill('');
    await composer.pressSequentially('bring @alex');
    await expect(people.getByRole('option', { name: 'Alex Chen' })).toBeVisible();
    await composer.press('Enter');
    await expect(composer.getByRole('img', { name: 'Mention: Alex Chen' })).toBeVisible();
  });

  await test.step('2. the group post shows the member chip', async () => {
    await page.getByRole('button', { name: 'Post', exact: true }).click();
    const article = page.getByRole('article').first();
    await expect(article.getByRole('img', { name: 'Mention: Alex Chen' })).toBeVisible();
    await expect(article).not.toContainText('@[');
  });

  await test.step('3. a comment under the group post tags the members too', async () => {
    await page.getByRole('article').first().getByRole('button', { name: 'View comments' }).click();
    const dialog = page.getByRole('dialog');
    const comment = dialog.getByRole('textbox', { name: 'Add a comment' });
    await comment.click();
    await comment.pressSequentially('@sam');
    await expect(dialog.getByRole('listbox', { name: 'People you can tag' }).getByRole('option', { name: 'Sam Ito' })).toBeVisible();
    await comment.press('Enter');
    await comment.press('Enter');
    await expect(dialog.getByRole('img', { name: 'Mention: Sam Ito' })).toBeVisible();
  });
});

test('Home Feed — the @ list opens at the caret, not under the box (CLIENT-GL-50 part 3)', async ({ page }) => {
  test.setTimeout(60000);
  await seedAuthenticatedSession(page);
  const composer = page.getByRole('textbox', { name: 'Create a post' });
  await composer.click();
  await composer.pressSequentially('a long line of words before the tag @shah');
  const list = page.getByRole('listbox', { name: 'People you can tag' });
  await expect(list.getByRole('option', { name: 'Priya Shah' })).toBeVisible();
  const box = await list.boundingBox();
  const field = await composer.boundingBox();
  expect(box).not.toBeNull();
  expect(field).not.toBeNull();
  // Far from the left edge of the box (the caret is after the long line), and inside the box's own height (right under the caret line).
  expect(box!.x).toBeGreaterThan(field!.x + 150);
  expect(box!.y).toBeLessThan(field!.y + field!.height);
});
