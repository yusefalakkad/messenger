import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ShieldCheck, Phone, Mic, Video as VideoIcon, Smile, Lock, Globe,
  ArrowRight, Play, Apple, Smartphone, Sparkles,
} from 'lucide-react';

/**
 * Главная — редакторская типографика, тёмный фон, ambient-блики, скрин телефона справа.
 * Видна только неавторизованным; авторизованных роутер уводит в ChatPage.
 */
export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div className="relative min-h-screen bg-dark-bg text-white overflow-x-hidden">
      <AmbientGlows />

      <Header onSignIn={() => navigate('/auth')} />

      <Hero
        onPrimary={() => navigate('/auth')}
        onDemo={() => {
          const el = document.getElementById('demo');
          el?.scrollIntoView({ behavior: 'smooth' });
        }}
      />

      <FeatureGrid />

      <PrivacySection />

      <DownloadSection onSignIn={() => navigate('/auth')} />

      <Footer />
    </div>
  );
}

// ─── Ambient floating gradient blurs ──────────────────────────────────────────

function AmbientGlows() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none">
      <motion.div
        animate={{ x: [0, 30, 0], y: [0, 20, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute -top-40 -left-40 w-[640px] h-[640px] rounded-full bg-accent-violet/30 blur-3xl"
      />
      <motion.div
        animate={{ x: [0, -25, 0], y: [0, -15, 0], scale: [1, 1.05, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute top-1/3 -right-40 w-[640px] h-[640px] rounded-full bg-accent-pink/25 blur-3xl"
      />
      <motion.div
        animate={{ x: [0, 18, 0], y: [0, -10, 0] }}
        transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute bottom-0 left-1/3 w-[440px] h-[440px] rounded-full bg-accent-orange/20 blur-3xl"
      />
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────────────────────

function Header({ onSignIn }: { onSignIn: () => void }) {
  return (
    <header className="relative z-10 px-6 lg:px-12 py-6 flex items-center justify-between max-w-[1480px] mx-auto">
      <div className="flex items-center gap-2.5">
        <div className="relative w-10 h-10 rounded-2xl bg-brand-gradient flex items-center justify-center shadow-glow-violet">
          <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
            <path d="M4 8C4 6.9 4.9 6 6 6h20c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H18l-4 4-2-4H6c-1.1 0-2-.9-2-2V8z" fill="white"/>
          </svg>
        </div>
        <span className="text-xl font-semibold tracking-tight">Dakka</span>
      </div>

      <nav className="hidden md:flex items-center gap-9 text-sm text-white/70">
        <a href="#features"  className="hover:text-white transition">Возможности</a>
        <a href="#privacy"   className="hover:text-white transition">Приватность</a>
        <a href="#download"  className="hover:text-white transition">Загрузить</a>
      </nav>

      <div className="flex items-center gap-3">
        <button
          onClick={onSignIn}
          className="hidden sm:inline-flex text-sm text-white/75 hover:text-white px-3 py-2 rounded-lg transition"
        >
          Войти
        </button>
        <button
          onClick={onSignIn}
          className="text-sm text-white/95 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.09] px-4 py-2 rounded-xl transition"
        >
          Скачать
        </button>
      </div>
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero({ onPrimary, onDemo }: { onPrimary: () => void; onDemo: () => void }) {
  return (
    <section className="relative z-10 px-6 lg:px-12 max-w-[1480px] mx-auto pt-12 lg:pt-24 pb-20 lg:pb-32">
      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-12 lg:gap-20 items-center">
        {/* ─── Left: typography hero ─── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
          className="space-y-8"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center gap-2 text-xs text-white/65 bg-white/[0.04] border border-white/[0.07] rounded-full px-3 py-1.5"
          >
            <Sparkles size={12} className="text-accent-pink" />
            E2E-шифрование по умолчанию · бесплатно
          </motion.div>

          {/* HUGE typography */}
          <h1 className="font-extrabold leading-[0.92] tracking-[-0.04em] text-[14vw] sm:text-[12vw] lg:text-[9vw] xl:text-[150px]">
            <span className="block text-white">
              ПИШИ<span className="text-white/70">.</span>
            </span>
            <span
              className="block bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  'linear-gradient(90deg, #ff4d8d 0%, #ff8a3d 100%)',
              }}
            >
              ГОВОРИ<span className="text-accent-pink/80">.</span>
            </span>
            <span
              className="block bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  'linear-gradient(90deg, #7c4dff 0%, #34e0d0 100%)',
              }}
            >
              ЖИВИ<span className="text-accent-violet/80">.</span>
            </span>
          </h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="text-white/55 text-lg max-w-md leading-relaxed"
          >
            Мессенджер, в котором каждое сообщение дышит. Реакции, голос, видео —
            в одном живом холсте.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex flex-col sm:flex-row gap-3"
          >
            <button
              onClick={onPrimary}
              className="group inline-flex items-center justify-center gap-2 bg-brand-gradient hover:opacity-95 active:scale-[0.98] transition px-7 py-4 rounded-full text-base font-medium shadow-glow-violet"
            >
              Скачать бесплатно
              <ArrowRight size={18} className="opacity-0 group-hover:opacity-100 -ml-1 group-hover:ml-0 transition-all" />
            </button>
            <button
              onClick={onDemo}
              className="inline-flex items-center justify-center gap-2 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.09] active:scale-[0.98] transition px-7 py-4 rounded-full text-base font-medium"
            >
              <Play size={16} fill="currentColor" /> Смотреть демо
            </button>
          </motion.div>
        </motion.div>

        {/* ─── Right: phone mockup ─── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.85, ease: [0.32, 0.72, 0, 1] }}
          className="relative mx-auto lg:mx-0"
          id="demo"
        >
          <PhoneMockup />
        </motion.div>
      </div>
    </section>
  );
}

// ─── Phone mockup with sample chat ────────────────────────────────────────────

function PhoneMockup() {
  return (
    <div className="relative w-[300px] sm:w-[340px] mx-auto">
      {/* glow behind phone */}
      <div className="absolute inset-0 -inset-x-12 bg-accent-pink/20 blur-3xl rounded-full" />

      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        className="relative rounded-[44px] bg-[#0a0814] border border-white/[0.08] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] overflow-hidden"
        style={{ aspectRatio: '0.49' }}
      >
        {/* notch */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-28 h-7 bg-black rounded-full z-30" />

        {/* status bar */}
        <div className="absolute top-0 left-0 right-0 px-6 pt-4 flex justify-between items-center text-[11px] text-white/85 z-20">
          <span className="font-medium">9:41</span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-2 rounded-sm border border-white/60" />
          </span>
        </div>

        {/* chat content */}
        <div className="absolute inset-0 pt-16 px-4 pb-4 flex flex-col">
          {/* peer header */}
          <div className="flex items-center gap-3 pb-3 border-b border-white/[0.06]">
            <button className="text-white/50 text-lg">‹</button>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent-pink to-accent-orange flex items-center justify-center text-xs font-semibold">
              МК
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">Майя</div>
              <div className="text-[10px] text-accent-pink/85">в сети</div>
            </div>
            <VideoIcon size={16} className="text-white/55" />
          </div>

          {/* messages */}
          <div className="flex-1 flex flex-col gap-2 mt-3 overflow-hidden">
            <Bubble own={false}>Видел новый Dakka? Интерфейс просто 🔥</Bubble>

            <Bubble own={true} gradient>Да! Живые реакции и стекло — топ</Bubble>

            {/* voice */}
            <div className="self-end flex items-center gap-2 bg-brand-gradient rounded-2xl px-3 py-2 max-w-[68%]">
              <Play size={12} fill="white" className="text-white" />
              <Waveform />
              <span className="text-[10px] text-white/85">0:12</span>
            </div>

            <Bubble own={false}>созвон вечером? 🎧</Bubble>
          </div>

          {/* composer */}
          <div className="mt-3 flex items-center gap-2">
            <button className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center text-white/55">
              +
            </button>
            <div className="flex-1 h-9 rounded-full bg-white/[0.04] border border-white/[0.06] px-4 flex items-center text-[12px] text-white/35">
              Сообщение
            </div>
            <button className="w-9 h-9 rounded-full bg-gradient-to-br from-accent-pink to-accent-orange flex items-center justify-center">
              <Mic size={14} fill="white" className="text-white" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Bubble({ children, own, gradient }: { children: React.ReactNode; own: boolean; gradient?: boolean }) {
  const cls = own
    ? gradient
      ? 'self-end bg-brand-gradient text-white rounded-2xl rounded-br-md px-3 py-2 text-[12px] max-w-[72%] shadow-glow-pink'
      : 'self-end bg-white/[0.08] text-white rounded-2xl rounded-br-md px-3 py-2 text-[12px] max-w-[72%]'
    : 'self-start bg-white/[0.05] text-white/95 rounded-2xl rounded-bl-md px-3 py-2 text-[12px] max-w-[72%] border border-white/[0.05]';
  return <div className={cls}>{children}</div>;
}

function Waveform() {
  const bars = [3, 8, 5, 11, 7, 13, 6, 10, 4, 9, 6, 11];
  return (
    <div className="flex items-center gap-[2px] flex-1">
      {bars.map((h, i) => (
        <div key={i} className="w-[2px] bg-white/85 rounded-full" style={{ height: h }} />
      ))}
    </div>
  );
}

// ─── Feature grid ─────────────────────────────────────────────────────────────

function FeatureGrid() {
  const items = [
    { icon: Lock,        title: 'E2E по умолчанию',     desc: 'ECDH P-256 + AES-256-GCM. Только вы и собеседник видите содержимое.' },
    { icon: Mic,         title: 'Голосовые сообщения',  desc: 'Жмёшь и говоришь — мгновенно, с волной и автостопом.' },
    { icon: VideoIcon,   title: 'Звонки и видео',       desc: 'Один-на-один + групповые до 8. Без задержек, через свой TURN/SFU.' },
    { icon: Smile,       title: 'Живые реакции',        desc: 'Эмодзи, ответы, цитаты, пересылка — всё под пальцем.' },
    { icon: Phone,       title: 'По номеру',            desc: 'Вход одним кодом через Telegram. Никаких паролей.' },
    { icon: Globe,       title: 'Web, iOS, Android',    desc: 'Один аккаунт, бесшовная синхронизация между устройствами.' },
  ];
  return (
    <section id="features" className="relative z-10 px-6 lg:px-12 max-w-[1480px] mx-auto py-20 lg:py-28">
      <SectionHeader
        chip="Возможности"
        title="Всё для живого общения"
        sub="Стандарт большой тройки — без рекламы, без слежки, без компромиссов в дизайне."
      />

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-12">
        {items.map((it, i) => (
          <motion.div
            key={it.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.55, delay: i * 0.05, ease: [0.32, 0.72, 0, 1] }}
            className="group p-6 rounded-2xl bg-white/[0.025] border border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.10] transition"
          >
            <div className="w-11 h-11 rounded-xl bg-brand-gradient-soft border border-white/[0.07] flex items-center justify-center mb-4 group-hover:scale-110 transition">
              <it.icon size={18} className="text-accent-pink" />
            </div>
            <div className="text-base font-medium mb-1.5">{it.title}</div>
            <div className="text-sm text-white/55 leading-relaxed">{it.desc}</div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ─── Privacy section ──────────────────────────────────────────────────────────

function PrivacySection() {
  return (
    <section id="privacy" className="relative z-10 px-6 lg:px-12 max-w-[1480px] mx-auto py-20 lg:py-28">
      <div className="grid lg:grid-cols-2 gap-14 items-center">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          <div className="inline-flex items-center gap-2 text-xs text-accent-violet/90 bg-accent-violet/[0.10] border border-accent-violet/[0.20] rounded-full px-3 py-1.5 mb-6">
            <ShieldCheck size={12} /> Приватность
          </div>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[0.95] mb-6">
            Ваши слова —<br />
            только <span className="bg-clip-text text-transparent bg-brand-gradient">ваши</span>.
          </h2>
          <p className="text-white/55 text-lg leading-relaxed max-w-md">
            Сообщения шифруются ещё на устройстве. Сервер видит только зашифрованный текст
            и не может его прочитать. Ключи лежат в Keychain / Keystore — никогда не покидают телефон.
          </p>

          <div className="mt-8 space-y-3 text-sm text-white/65">
            {[
              'P-256 ECDH + AES-256-GCM, bit-perfect между Web/iOS/Android',
              'TURN с эфемерными HMAC-credentials, TTL 10 минут',
              'Push-нотификации без содержимого сообщений',
              'Двухфакторная защита через TOTP (Google Authenticator)',
            ].map((line) => (
              <div key={line} className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-accent-pink" />
                {line}
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="relative"
        >
          <div className="relative p-8 rounded-3xl bg-white/[0.03] border border-white/[0.07] overflow-hidden">
            <div className="absolute -inset-1 bg-brand-gradient-soft blur-2xl pointer-events-none" />
            <div className="relative flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-brand-gradient flex items-center justify-center shadow-glow-violet">
                <Lock size={28} className="text-white" />
              </div>
              <div>
                <div className="text-2xl font-semibold">Сквозное шифрование</div>
                <div className="text-sm text-white/55">включено для всех чатов</div>
              </div>
            </div>

            <div className="relative mt-7 p-4 rounded-xl bg-dark-bg/60 border border-white/[0.05] font-mono text-[11px] text-white/70 leading-relaxed">
              <span className="text-accent-pink">{'> '}</span>encrypted: <span className="text-accent-orange">true</span><br/>
              <span className="text-accent-pink">{'> '}</span>algo: <span className="text-accent-orange">'ECDH-P256+AES-GCM'</span><br/>
              <span className="text-accent-pink">{'> '}</span>nonce: <span className="text-white/40">12 bytes</span><br/>
              <span className="text-accent-pink">{'> '}</span>auth_tag: <span className="text-white/40">16 bytes</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Download section ─────────────────────────────────────────────────────────

function DownloadSection({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section id="download" className="relative z-10 px-6 lg:px-12 max-w-[1480px] mx-auto py-20 lg:py-28">
      <SectionHeader
        chip="Загрузить"
        title="Везде, где вы есть"
        sub="Установите Dakka на любое устройство — все ваши чаты автоматически появятся."
      />

      <div className="grid sm:grid-cols-3 gap-4 mt-12">
        <DownloadCard
          icon={Apple}
          title="iPhone & iPad"
          sub="iOS 16.4+"
          onClick={onSignIn}
        />
        <DownloadCard
          icon={Smartphone}
          title="Android"
          sub="Android 8+"
          onClick={onSignIn}
        />
        <DownloadCard
          icon={Globe}
          title="Web"
          sub="Браузер — прямо здесь"
          onClick={onSignIn}
          highlight
        />
      </div>
    </section>
  );
}

function DownloadCard({
  icon: Icon, title, sub, onClick, highlight,
}: {
  icon: typeof Apple; title: string; sub: string; onClick: () => void; highlight?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative text-left p-6 rounded-2xl border transition overflow-hidden
        ${highlight
          ? 'bg-brand-gradient-soft border-white/[0.12] hover:border-white/[0.20]'
          : 'bg-white/[0.025] border-white/[0.06] hover:bg-white/[0.04] hover:border-white/[0.10]'
        }`}
    >
      {highlight && <div className="absolute -top-1 -right-1 text-[10px] bg-brand-gradient text-white px-2 py-0.5 rounded-bl-lg rounded-tr-lg">сейчас</div>}
      <Icon size={32} className="mb-4 text-white/85 group-hover:scale-110 transition" />
      <div className="text-base font-medium mb-1">{title}</div>
      <div className="text-sm text-white/55">{sub}</div>
      <div className="flex items-center gap-1 mt-3 text-xs text-accent-pink opacity-0 group-hover:opacity-100 transition">
        Открыть <ArrowRight size={12} />
      </div>
    </button>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="relative z-10 px-6 lg:px-12 max-w-[1480px] mx-auto py-12 border-t border-white/[0.05]">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-white/40">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-brand-gradient flex items-center justify-center">
            <svg width="12" height="12" viewBox="0 0 32 32" fill="none">
              <path d="M4 8C4 6.9 4.9 6 6 6h20c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H18l-4 4-2-4H6c-1.1 0-2-.9-2-2V8z" fill="white"/>
            </svg>
          </div>
          <span className="text-white/65 font-medium">Dakka</span>
          <span>· 2026</span>
        </div>
        <div className="flex items-center gap-6">
          <a href="#" className="hover:text-white/70 transition">Условия</a>
          <a href="#" className="hover:text-white/70 transition">Конфиденциальность</a>
          <a href="mailto:hello@akkdmsg.online" className="hover:text-white/70 transition">Связаться</a>
        </div>
      </div>
    </footer>
  );
}

// ─── Reusable section header ──────────────────────────────────────────────────

function SectionHeader({ chip, title, sub }: { chip: string; title: string; sub: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="text-center max-w-2xl mx-auto"
    >
      <div className="inline-flex items-center gap-2 text-xs text-white/60 bg-white/[0.04] border border-white/[0.07] rounded-full px-3 py-1.5 mb-5">
        {chip}
      </div>
      <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[0.95] mb-5">
        {title}
      </h2>
      <p className="text-white/55 text-lg leading-relaxed">{sub}</p>
    </motion.div>
  );
}
