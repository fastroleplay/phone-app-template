import {
  isPhoneError,
  usePhoneApp,
  usePhoneContext,
  usePhoneEvent,
  usePhonePermission,
} from '@fastrp/phone-app-sdk/react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { applyContext, previewUrl } from './phone';

const NOTE_KEY = 'note';

export default function App() {
  const { sdk, status } = usePhoneApp();
  // Live: re-renders on theme.changed, permissions.changed and viewport.changed.
  const context = usePhoneContext();

  // The theme and safe areas become CSS variables; because this runs on every context change, a
  // theme switch while the app is open restyles every component without further code.
  useEffect(() => {
    if (context) applyContext(context);
  }, [context]);

  if (status !== 'ready' || !context) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-2 px-5 text-center">
        {status === 'connecting' ? <p>Bağlanıyor…</p> : null}

        {status === 'mismatch' ? <p>Bu uygulama telefonunuzun sürümüyle uyumlu değil.</p> : null}

        {status === 'outside' ? (
          <>
            <p>Bu sayfa oyun içi telefonda çalışmak için yazıldı.</p>
            <p className="text-sm text-muted-foreground">
              Önizleme aracında aç — bu sayfanın adresi zaten dolu gelir.
            </p>
            {/* Built from the current origin, so it points at whatever port Vite picked. */}
            <Button asChild className="mt-2">
              <a href={previewUrl()} target="_blank" rel="noreferrer">
                Önizlemede aç
              </a>
            </Button>
          </>
        ) : null}
      </main>
    );
  }

  return (
    // The background runs edge to edge; the safe areas keep content clear of the phone's own
    // chrome. `pt-safe-top` and `pb-safe-bottom` come from the spacing tokens in styles.css.
    <main className="flex min-h-screen flex-col gap-5 px-5 pt-[calc(var(--safe-top)+1rem)] pb-[calc(var(--safe-bottom)+1rem)]">
      <header>
        <h1 className="text-3xl font-bold">Kahve</h1>
        {/* A per-install handle, not the character. Never treat it as proof of identity. */}
        <p className="mt-1 truncate text-sm text-muted-foreground">{context.installId}</p>
      </header>

      <NoteCard />
      <NotifyCard />
      <EventsCard />

      <Button variant="outline" onClick={() => void sdk.phone.close()}>
        Uygulamayı kapat
      </Button>
    </main>
  );
}

/** `storage.*` — per-install key/value that survives the app being closed. No permission needed. */
function NoteCard() {
  const { sdk } = usePhoneApp();
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    sdk.storage.get<string>(NOTE_KEY).then((value) => {
      if (value !== undefined) {
        setNote(value);
        setSaved(value);
      }
    });
  }, [sdk]);

  const save = async () => {
    try {
      await sdk.storage.set(NOTE_KEY, note);
      setSaved(note);
    } catch (error) {
      // QUOTA_EXCEEDED and RATE_LIMITED are the two answers a chatty writer gets.
      setSaved(isPhoneError(error) ? `Kaydedilemedi: ${error.code}` : 'Kaydedilemedi.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sipariş notu</CardTitle>
        <CardDescription>Sıradan bir input — SDK odağı kendi bildiriyor.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {/* Typing here does not walk the player's character: the SDK reports focus to the phone
            automatically. Only a custom on-screen keypad needs setInputFocus. */}
        <Input
          placeholder="Az şekerli…"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <Button onClick={save}>Kaydet</Button>
        {saved !== null ? (
          <p className="text-sm text-muted-foreground">Kayıtlı: {saved}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** `phone.notify` behind its permission, with `permissions.request` when it is missing. */
function NotifyCard() {
  const { sdk } = usePhoneApp();
  const notify = usePhonePermission('phone.notify');
  const [note, setNote] = useState('');

  const send = async () => {
    try {
      await sdk.phone.notify({ title: 'Kahve', body: 'Siparişin hazır.' });
      setNote('Bildirim gönderildi.');
    } catch (error) {
      // PERMISSION_DENIED is an ordinary answer, not a failure — the player said no.
      setNote(
        isPhoneError(error) && error.code === 'PERMISSION_DENIED'
          ? 'Bildirim izni verilmemiş.'
          : 'Bildirim gönderilemedi.',
      );
    }
  };

  const ask = async () => {
    // Opens the phone's grant sheet. Refusing is not an error; the promise resolves `false`.
    const granted = await notify.request();
    setNote(granted ? 'İzin verildi.' : 'Oyuncu izin vermedi.');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bildirim</CardTitle>
        <CardDescription>
          {notify.granted ? 'Oyuncu bu izni verdi.' : 'Oyuncu bu izni vermedi.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {notify.granted ? (
          <Button onClick={send}>Bildirim gönder</Button>
        ) : (
          <Button onClick={ask}>İzin iste</Button>
        )}
        {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
      </CardContent>
    </Card>
  );
}

/** Host → app events. The theme is handled in `App` through the context; these are the rest. */
function EventsCard() {
  const [last, setLast] = useState('Henüz olay yok.');

  usePhoneEvent('notification', (push) => setLast(`Push: ${push.title}`));
  usePhoneEvent('app.visibility', ({ visible }) =>
    setLast(visible ? 'Telefon açıldı.' : 'Telefon kapandı.'),
  );
  usePhoneEvent('permissions.changed', ({ permissions }) =>
    setLast(`İzinler: ${permissions.join(', ') || 'yok'}`),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Olaylar</CardTitle>
        <CardDescription>Telefondan gelen son olay.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{last}</p>
      </CardContent>
    </Card>
  );
}
