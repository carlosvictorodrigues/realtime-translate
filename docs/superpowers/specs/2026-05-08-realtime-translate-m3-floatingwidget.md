# Realtime Translate — M3 FloatingWidget Design

**Status:** approved (brainstorm fase)
**Data:** 2026-05-08
**Autor:** Gabriel (com Claude)
**Relação:** sub-spec de [2026-05-07-realtime-translate-design.md](2026-05-07-realtime-translate-design.md). Substitui §3 (FloatingWidget) e §9 (Design language) onde divergem; herda os demais.

## 1. Objetivo

Definir o desenho final do **FloatingWidget** — barra horizontal sempre-visível que substitui o `BidirectionalTestRig` interim. É a superfície primária do app durante uso ativo; a `SetupView` (janela separada) é a superfície secundária pra config/diagnostics.

A spec original (2026-05-07) descreveu um widget vertical compact 280×200 (mockup em [docs/design/design-system.html](../../design/design-system.html), seção "Floating widget — estados"). Após brainstorm o usuário trouxe um conceito novo (barra horizontal acima da taskbar, glass/Mica). Esta spec captura o **merge** dos dois: aesthetic do conceito novo + função do original (controles essenciais sempre visíveis).

## 2. Sumário de decisões

| Decisão | Escolha |
|---|---|
| Forma | Barra horizontal 32px de altura, cantos pill-ish (16px) |
| Posição | Centralizada acima da taskbar; draggável; persistida em `prefs.json` |
| Tipografia | Segoe UI Variable (Windows-native) com fallback `'Segoe UI', system-ui` |
| Surface | Glass: `rgba(28, 30, 36, 0.78)` + `backdrop-filter: blur(40px) saturate(140%)` |
| Accent | `#6e7fc4` (indigo muted) — preservado da spec original |
| Label de idiomas | Códigos ISO (`PT ↔ EN`) — minimalista, sem ambiguidade textual |
| Controles always-visible | Pause/Resume + Settings + lang pair clicável |
| Transcript | Fora da barra; vive em SetupView (sub-spec separada) |
| Acesso a config | Ícone ⚙ abre SetupView em janela separada |
| First-launch | Direto pra SetupView wizard; barra aparece após setup OK |
| Acoplamento backend | Wire em `SessionManager` existente (start/stop preservados como pause/resume na UI) |

## 3. Arquitetura — duas janelas

```
┌─────────────────────────────────────────────────────────┐
│  ELECTRON MAIN PROCESS                                  │
│   ├─ FloatingWidget BrowserWindow (frameless, on-top)   │
│   └─ SetupView BrowserWindow (frame normal, on demand)  │
│                                                          │
│   ConfigStore (safeStorage) · UserPrefsStore (prefs.json)│
│   SessionManager · AudioRouter · Logger                  │
└─────────────────────────────────────────────────────────┘
```

- **FloatingWidget** = barra. Sempre visível enquanto app rodando (após setup inicial)
- **SetupView** = janela full pra config/diagnostics/Test Translation. Aberta sob demanda (⚙ na barra ou first-launch)
- As duas janelas comunicam com o main via IPC tipado existente; SessionManager é a única fonte de verdade do estado da tradução

## 4. Linguagem visual da barra

### Surface

```css
height: 32px;
background: rgba(28, 30, 36, 0.78);
backdrop-filter: blur(40px) saturate(140%);
border: 1px solid rgba(255, 255, 255, 0.08);
border-radius: 16px;
box-shadow: 0 8px 24px rgba(0,0,0,0.5),
            inset 0 1px 0 rgba(255,255,255,0.08);
```

Fallback se `backdrop-filter` não disponível (improvável em Electron 42+ Chromium): bg sólido `rgba(28, 30, 36, 0.95)` sem blur.

Mica nativo do Windows 11 fica como follow-up M4+ (depende de pacote `electron-acrylic-window` ou flags experimentais; o glass via backdrop-filter é suficiente pra MVP).

### Tipografia

- Família: `'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif`
- Tamanho default: 12px
- Lang pair codes: 11px, weight 500, letter-spacing 0.04em
- Latência: 10px, mono (`'Cascadia Code', Consolas, monospace`)
- Status text (reconnecting/error): 11px, weight 500

### Cor

Herda paleta da spec original (§9). Acentos específicos da barra:
- Orb idle: `rgba(244, 244, 245, 0.3)` (cinza apagado)
- Orb active: `#6e7fc4` com glow `0 0 12px rgba(110, 127, 196, 0.7)`, animação pulse 1.6s
- Orb reconnecting: `#f59e0b` com glow amarelo, pulse 0.9s (mais rápido = urgência)
- Orb error: `#f87171` com glow vermelho, sem animação
- Background tints por estado: ver §6

## 5. Elementos da barra (esquerda → direita)

| Elemento | Quando visível | Comportamento |
|---|---|---|
| **Orb** (8×8 círculo) | Sempre | Cor reflete estado; anima quando active/reconnecting |
| **Waveform** (5 barras) | Active only | Anima representando captura de áudio (decoração — não plot real) |
| **Lang pair** (`PT ↔ EN`) | Sempre exceto reconnecting/error | Clicável; abre SetupView com seção de idiomas em foco |
| **Status text** | Reconnecting / Error | Substitui lang pair; mostra "Reconectando · tentativa N" ou "Erro: <mensagem>" (truncada em ~28 chars) |
| **Latency** (`1.2s` mono) | Active only | Média móvel últimos 5 turnos (spec original §5) |
| **Action button** | Sempre | ▶ idle, ⏸ active, ↻ error. Accent muted bg pra destacar como ação primária |
| **Settings ⚙** | Sempre | Ghost icon; abre SetupView |

### Sizing

Largura é `auto` baseada em conteúdo, com padding fixo `0 6px 0 14px` e `gap: 10px`. Aproximações:
- Idle/Paused: ~150px
- Active: ~290px
- Reconnecting: ~250px
- Error: ~260-340px (depende da mensagem)

## 6. Estados — 5 visuais

### 6.1 Idle / Paused

```
[ ⚪  PT ↔ EN  ▶  ⚙ ]
```
- Orb cinza apagado, sem glow
- Sem waveform, sem latency
- Action ▶ = Iniciar (primeira vez) ou Retomar (após pause)
- Glass default

### 6.2 Connecting

Mesmo layout que Active mas:
- Orb pulsa accent muito devagar (2.5s)
- Sem waveform ainda
- Sem latency ainda
- Status text inline: "Conectando…" no lugar do lang pair (até primeiro `output_audio.delta`)

### 6.3 Active

```
[ • ▌▌▌▌▌▌  PT ↔ EN  1.2s  ⏸  ⚙ ]
```
- Orb accent com glow, pulse 1.6s
- Waveform animado (5 barras)
- Lang pair, latency, pause, settings todos visíveis
- Glass default
- Botão Pause é o **mais destacado** (accent muted bg + accent border) — afinal o usuário usa ele pra controlar custo da OpenAI

### 6.4 Reconnecting

```
[ ⚠ Reconectando · tentativa 2  ⏸  ⚙ ]
```
- Background tinge: `rgba(60, 45, 18, 0.7)` (warning subtle)
- Border: `rgba(245, 158, 11, 0.2)`
- Orb amarelo pulsando rápido (0.9s)
- Lang pair substituído por status text "Reconectando · tentativa N" em warning
- Pause continua visível pra usuário cancelar se reconnect demorar
- Sem waveform/latency

### 6.5 Error

```
[ ⚠ Erro: chave inválida  ↻  ⚙ ]
```
- Background tinge: `rgba(60, 22, 22, 0.78)` (error subtle)
- Border: `rgba(248, 113, 113, 0.25)`
- Orb vermelho, sem animação
- Mensagem inline (truncada em ~28 chars; tooltip mostra mensagem completa)
- Action vira ↻ Retry: dispara nova tentativa de start (reseta serverError flag, novo backoff)
- Click ⚙ leva pra SetupView com seção do erro em foco (key inválida → seção da chave; cabo faltando → seção de devices; etc.)

### Transições

| De → Para | Trigger | Animação |
|---|---|---|
| Idle → Connecting | User click ▶ | Width expande, orb passa a pulsar |
| Connecting → Active | First `output_audio.delta` recebido | Waveform fade-in 200ms; latency aparece |
| Active → Paused | User click ⏸ | Width contrai, waveform/latency fade-out |
| Active → Reconnecting | `state.kind === 'reconnecting'` | BG cross-fade pra warning, status text replace |
| Reconnecting → Active | Reconnect succeed | BG cross-fade pra default |
| * → Error | `state.kind === 'error'` | BG cross-fade pra error |

Bidirecional: SessionA e SessionB têm estados independentes. Política da UI: **pega o pior** dos dois pra exibir na barra. Hierarquia: error > reconnecting > connecting > active > idle. Ex: se A=active e B=reconnecting, barra mostra reconnecting com texto "B: tentativa 2". Estados mistos transitórios (A=active + B=connecting) tratados como connecting — startup sincronizado faz isso ser raro na prática.

## 7. Interações

| Ação | Resultado |
|---|---|
| Click action button (▶) | Inicia tradução (chama `rt.startTranslation()` com prefs persistidos) |
| Click action button (⏸) | Pausa (chama `rt.stopTranslation()`; preserva todos os device IDs + idiomas em store) |
| Click action button (↻) | Reset error state + retry start |
| Click ⚙ | Abre SetupView (cria janela se não existir; foca se já existe) |
| Click lang pair | Abre SetupView focado em seção de idiomas |
| Drag em qualquer área não-clicável | Move janela (region drag CSS `-webkit-app-region`) |
| Hover na barra | Só feedback discreto em hover de cada elemento clicável (já no estilo) — sem reveal de elementos novos |

**Sem hover-reveal de elementos.** Todos os controles são always-visible — anti-pattern Windows evitado. Trade-off com B original aceito.

**Sem context menu (right-click)** no MVP. Quit pelo SetupView (botão "Sair" na footer). Pode entrar em M4+ se houver demanda.

## 8. Posição & persistência

- **Default:** centralizada horizontalmente acima da taskbar Windows. Coordenadas calculadas em runtime via `screen.getPrimaryDisplay().workArea` no main process
- **Draggável:** sim, via `-webkit-app-region: drag`. Drag handle é a área entre os elementos (não os botões/ícones)
- **Persistência:** após cada drag, salva `{x, y}` em `prefs.json`. Restaura no próximo launch. Validação: se posição salva ficar off-screen (mudou monitor), cai pro default
- **Always-on-top:** sim. Configurado no BrowserWindow do main
- **Frame:** sem (`frame: false`, `transparent: true`)

`prefs.json` schema (extende a Parte B do plano M3 — config persistence):

```json
{
  "widgetPosition": { "x": 720, "y": 1010 },
  "languages": { "source": "pt", "target": "en" },
  "devices": {
    "mic": "...",
    "toMeet": "...",
    "fromMeet": "...",
    "headset": "..."
  }
}
```

## 9. Transcript — fora da barra

A barra **não exibe transcript**. Justificativa:
1. Voice-to-voice — usuário ouve a tradução direto, transcript é review-after-the-fact
2. Adicionar transcript na barra obriga expansão vertical, conflita com filosofia "barra é só a barra"
3. Espaço pra transcript existe naturalmente no SetupView (que tem janela full)

Transcript live durante sessão ativa fica disponível em SetupView (se janela aberta). Histórico persistido entre sessões fica fora do MVP (spec original §11: "Persistência de transcript — sessão ativa apenas").

Sub-spec da SetupView (próxima brainstorm) detalha onde/como.

## 10. SetupView (referência, não detalhe)

Detalhamento completo fica em sub-spec separada. O essencial pra esta spec:
- Janela separada, não-translucida (frame normal)
- Acessada via ⚙ ou via click no lang pair
- First-launch: modo wizard linear (key → devices → Test Translation)
- Subsequent launches: modo dashboard (status checks + ações rápidas)
- Inclui Test Translation, transcript live, export logs, guia visual de Meet config

## 11. Implementação — notas técnicas

### Componentes React (`src/renderer/views/`)

```
FloatingWidget.tsx           — root da janela barra
  ├─ Orb.tsx                 — círculo de status com animation
  ├─ Waveform.tsx            — 5 barras animadas (decoração)
  ├─ LanguagePair.tsx        — clicável, abre SetupView
  ├─ LatencyMeter.tsx        — média móvel últimos 5 turnos
  ├─ ActionButton.tsx        — pause/resume/retry baseado em state
  └─ SettingsButton.tsx      — abre SetupView
```

### Wire backend

- IPC existente: `rt.startTranslation()` / `rt.stopTranslation()` continuam servindo. Nenhuma mudança na API
- "Pause" é só relabel de Stop na UI — semântica de close-WS-and-stop-capture é mantida (e está corretísssima após o fix de `e1a86d9`)
- Estado `paused` no UI = `idle` no backend (mesma coisa)
- "Resume" é re-call de `startTranslation` com mesmos device IDs/lang preservados em store

### Janelas

- **FloatingWidget BrowserWindow:** `{ frame: false, transparent: true, alwaysOnTop: 'screen-saver', resizable: false, width: 480, height: 40, focusable: true, skipTaskbar: true }`. Container fica generoso (480×40) pra acomodar todos os estados; barra interna usa `width: auto` e fica centralizada (área transparente fora da barra é invisível). Alternativa: chamar `setBounds()` ao mudar estado pra ajustar width dinamicamente — fica como decisão de implementação
- **SetupView BrowserWindow:** `{ frame: true, width: 720, height: 640, resizable: true }`. Criada lazily quando ⚙ é clicado; reusa instância se já aberta (`focus()` em vez de criar nova)

### Lifecycle

- App start:
  1. Carrega prefs.json
  2. Se `apiKey` ausente OU `devices` incompletos → cria SetupView wizard, NÃO cria FloatingWidget
  3. Se setup ok → cria FloatingWidget na posição persistida; SetupView fica fechada
- App quit (clicar Sair no SetupView): teardown SessionManager; close ambas janelas; `app.quit()`

## 12. Acceptance criteria

- [ ] Barra renderiza com glass + Segoe UI Variable + 32px height
- [ ] Os 5 estados visuais renderizam conforme §6 (idle, connecting, active, reconnecting, error)
- [ ] Pause/Resume é always-visible durante active (não some no hover)
- [ ] Estados reconnecting e error são imediatamente óbvios (bg tint + orb color)
- [ ] Drag-to-reposition funciona; posição persiste entre app restarts
- [ ] First-launch sem API key vai pra SetupView wizard, NÃO renderiza barra
- [ ] Click ⚙ abre/foca SetupView
- [ ] BrowserWindow é frameless, transparent, always-on-top, skipTaskbar
- [ ] Bar handles bidirectional state (pega o pior dos dois)
- [ ] Mensagem de erro >28 chars trunca + tooltip mostra completa

## 13. Out of scope

- **SetupView details** — sub-spec separada (próxima brainstorm)
- **Quick lang change popover** ao clicar lang pair — defer M4+; por ora abre SetupView
- **Right-click context menu** — defer M4+
- **Mica nativo Windows 11** — defer M4+; CSS backdrop-filter é suficiente pra MVP
- **Cost estimate live** na barra — defer; SetupView mostra cost atual da sessão
- **Keyboard shortcuts globais** (Ctrl+Shift+P pra pause global, etc) — defer M4+
- **Transcript live na barra** — descartado, vive em SetupView
- **Multi-monitor smart positioning** (mover barra de monitor ao detectar Meet em outro) — defer; default funciona

## 14. Riscos & mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| `backdrop-filter` perf em desktop fraco | Baixo | Fallback sólido detectado via `CSS.supports`. Visual aceitável |
| Drag region conflita com elementos clicáveis | Médio | Padrão Electron: `-webkit-app-region: drag` no contêiner, `no-drag` nos children clicáveis |
| Posição persistida fica off-screen ao mudar monitor | Médio | Validação no startup: se `(x, y)` fora de qualquer `screen.getAllDisplays()`, fallback default |
| Sizing variável (texto erro longo) quebra layout | Baixo | `max-width: 380px` com truncate; hover/click pra mensagem completa |
| Frameless + transparent + always-on-top é não-padrão Electron | Baixo | Tested pattern (Spotify mini, Slack widget); funciona em Win10/11 |

## 15. Referências

- Spec original: [2026-05-07-realtime-translate-design.md](2026-05-07-realtime-translate-design.md)
- Mockup original do widget vertical (4 estados): [docs/design/design-system.html](../../design/design-system.html) — agora superado por esta spec; mantido como histórico
- Mockup vivo do C merged: [docs/design/floating-widget-states.html](../../design/floating-widget-states.html) (HTML standalone com 4 estados renderizados)
- Bug fix que estabeleceu a base do drop signal (banner reconnecting/error): commit `e1a86d9`

---

## Próximos passos

1. Sub-spec SetupView (próxima brainstorm separada)
2. Plano de implementação consolidado M3 (`writing-plans` skill) cobrindo: prefs persistence, FloatingWidget, SetupView, backend follow-ups (logger, refactor app.ts, AudioRouter abstraction, latency wire-up, transcript subscription, etc.)
