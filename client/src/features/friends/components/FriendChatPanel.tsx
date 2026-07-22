import { IconInfoCircle } from '@tabler/icons-react';
import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

interface ChatMessage {
  id: number;
  text: string;
  isOwn: boolean;
}

interface FriendChatPanelProps {
  /** The other person's first name, shown as a label on their bubbles.
   * There's no real DM backend at all (see FRIEND-1's ticket — filed as
   * DM-1/DM-2 for later), so this panel never actually has another
   * participant's messages to show — kept for when a real backend exists
   * and this becomes wired to actual senders. */
  otherPersonFirstName: string;
}

/**
 * Local-state-only 1:1 chat UI (bottom half of `FriendContent`'s fixed
 * 50/50 split) — same precedent as `GroupChatTab` before CHAT-2: no
 * backend exists (DM-1/DM-2 are filed, not built), so nothing here
 * persists past a remount. `FriendsPage` keys this component per selected
 * person, same "remount resets it" pattern `GroupChatTab` already uses per
 * selected group.
 */
export function FriendChatPanel({ otherPersonFirstName }: FriendChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { id: prev.length, text, isOwn: true }]);
    setDraft('');
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2.5 flex items-start gap-1.5 rounded-lg bg-surface-1 px-2.5 py-2 text-2xs text-text-muted">
        <IconInfoCircle className="mt-0.25 size-3.5 shrink-0" aria-hidden="true" />
        Direct messaging isn't built yet — messages here aren't saved and will disappear if you
        select someone else.
      </div>
      <div className="border-hairline flex flex-1 flex-col overflow-hidden rounded-xl border-border bg-surface-2">
        <div className="flex-1 overflow-y-auto p-3.5">
          {messages.length === 0 ? (
            <p className="text-2sm text-text-muted">No messages yet.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex flex-col ${message.isOwn ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg px-2.75 py-1.75 text-2sm ${
                      message.isOwn ? 'bg-bg-accent text-text-primary' : 'bg-surface-1 text-text-primary'
                    }`}
                  >
                    {!message.isOwn && (
                      <div className="mb-0.5 text-2xs font-medium text-text-primary">
                        {otherPersonFirstName}
                      </div>
                    )}
                    {message.text}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-hairline-t flex gap-2 border-border p-2.5">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') send();
            }}
            placeholder="Message…"
            aria-label="Message"
          />
          <Button variant="primary" size="sm" onClick={send} disabled={draft.trim().length === 0}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
