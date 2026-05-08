# Realtime Translate — M4 SetupView Design

**Status:** approved (brainstorm fase)
**Data:** 2026-05-08
**Autor:** Gabriel (com Claude)
**Relação:** sub-spec de [2026-05-07-realtime-translate-design.md](2026-05-07-realtime-translate-design.md). Consome a barra de [2026-05-08-realtime-translate-m3-floatingwidget.md](2026-05-08-realtime-translate-m3-floatingwidget.md). Substitui o `SetupViewStub` (que reusa `BidirectionalTestRig`) que ficou como placeholder no M3.

## 1. Objetivo

Romper a barreira técnica que impedia usuários não-desenvolvedores de configurar e usar o app. Hoje o setup exige `git clone` + `npm run dev` + instalar VB-CABLE manualmente + adivinhar a config do Meet. Esta spec define a **SetupView real** — uma janela de wizard linear pra first-launch + tela de review pra reconfig — que segura a mão do usuário através de cada barreira.

Também introduz **i18n** da UI (cross-cutting): all strings extraídas em arquivos de locale (PT-BR + EN-US no MVP), seletor de idioma persistente.

**Restrições binding:**
- Usuário-alvo: profissional que usa Meet, sem skill técnica. Não sabe o que é "device ID", "WebSocket", "API key" sem explicação.
- Visual language: premium/discreto (Linear/Raycast/Arc), preservando tokens da spec original (§9).
- Não pode esconder a barreira da OpenAI key (BYOK é cravado no design), mas pode levar a mão do usuário até criar a conta.

## 2. Sumário de decisões

| Decisão | Escolha |
|---|---|
| Forma do fluxo | **Wizard linear** (passo-a-passo forçado) na first-launch · **Review screen** (dashboard) na reabertura |
| Steps do wizard | 6: Welcome → Key → VB-CABLE → Devices → Meet → Test Translation |
| Welcome (passo 1) | Diagrama de áudio bidirecional com ícones + "app traduz" label · "Começar →" |
| API Key (passo 2) | Input masked + link pra signup OpenAI + 3 screenshots de "como pegar a key" |
| VB-CABLE (passo 3) | Auto-detect; se OK → ✓ próximo. Se faltar → botão "Baixar VB-CABLE A+B" + screenshots numerados de install + "Já instalei, re-detectar" |
| Devices (passo 4) | 4 dropdowns: mic, toMeet (auto-CABLE-A), fromMeet (auto-CABLE-B), headset. Mantém shape atual do SetupViewStub |
| Meet (passo 5) | Screenshots numerados (5 imagens) mostrando Settings → Audio → Mic = CABLE-A Output, Speaker = CABLE-B Input · Checkbox "Já configurei" |
| Test Translation (passo 6) | Skippable com warning. Direction A: WAV → Session A → loopback CABLE-A. Direction B: WAV → Session B → headset (user ouve). |
| Subsequente (⚙ na barra) | **Review screen** com 5 seções (Key, Cabos, Idiomas, Devices, Meet) · cada uma com status icon + valor atual + botão "Editar" que abre o passo do wizard correspondente |
| i18n MVP | PT-BR + EN-US. Strings em JSON. Auto-detect via `app.getLocale()` (fallback EN). Override via dropdown no titlebar |
| Persistência i18n | Novo campo `prefs.uiLanguage` (distinto de `prefs.languages` source/target) |
| Window size | 720×640 (mantém M3 SetupView size) · resizable |
| Botão Sair | Existe globalmente — no review screen footer; durante wizard fica num menu (×/Sair) no titlebar |
| Cost dashboard live | Tag `$0.42` em mono dim na barra (active state), atualiza 1× por segundo. Cálculo client-side: $0.034/min × elapsed × N sessões ativas |

## 3. Arquitetura

### Modos da SetupView

```
SetupView (single BrowserWindow, 720x640)
├─ Wizard mode (first-launch)
│  ├─ 6 steps lineares
│  ├─ Progress bar visível
│  └─ Termina com "Concluir setup → abrir barra"
│
└─ Review mode (subsequent, via ⚙ na barra)
   ├─ 5 sections com status + value + Edit
   ├─ Sem progress bar
   └─ Footer: Testar tradução · Sair · Fechar
```

**Single window, two modes.** Roteamento decidido em runtime via `isSetupComplete(configStore, prefsStore)` (já existe no main process). Wizard mode envia explicit `markSetupComplete()` IPC quando user termina passo 6 → main fecha SetupView e abre/foca a barra.

Review mode pode despachar pra steps individuais do wizard via roteamento interno do React (ex: `<Route path="/review">` vs `<Route path="/wizard/:step">`). Compartilha componentes (cada Step é renderizável standalone).

### Fluxo first-launch vs subsequente

```
App launch:
  ├─ if isSetupComplete → bar appears, no SetupView
  ├─ else → SetupView opens in /wizard/1
  
User clicks ⚙ on bar:
  └─ SetupView opens in /review
  
User clicks "Editar" on review section X:
  └─ SetupView routes to /wizard/X (e.g., /wizard/2 for Key)
  └─ Step renders with "Salvar e voltar" instead of "Avançar →"
  └─ Click → save → routes back to /review
```

**Edit-mode within wizard step:** quando step é alcançado via review (não via wizard sequência), o footer muda — "Voltar ← / Salvar e voltar →" em vez de "Voltar / Avançar". O state do step (form values, etc.) é hydrated do prefs pra permitir edição.

### i18n cross-cutting

```
src/shared/i18n/
├─ locales/
│  ├─ pt-BR.json    # source-of-truth
│  └─ en-US.json    # translated
└─ index.ts         # I18nProvider, useT() hook, t(key, vars) function

Renderer process (FloatingWidget AND SetupView):
  ├─ <I18nProvider locale={resolvedLocale}>
  │   <App />
  │ </I18nProvider>
  └─ Components call const t = useT(); t('setup.welcome.heading')
```

Locale resolution order:
1. `prefs.uiLanguage` (user override)
2. `app.getLocale()` (OS locale, ex: 'pt-BR', 'en-US')
3. Fallback `'en-US'`

If resolved locale doesn't have a translation file, fallback to en-US silently.

## 4. Wizard steps detalhados

Each step is a self-contained React component under `src/renderer/views/setup/wizard/`.

### Passo 1 — Welcome

**Conteúdo:**
- Heading: `t('setup.welcome.heading')` → "Vamos te configurar em ~5 minutos"
- Sub: `t('setup.welcome.sub')` → "O Realtime Translate traduz suas conversas no Google Meet em tempo real. Aqui está como funciona:"
- **Audio flow diagram** (componente próprio): 2 linhas, cada uma mostrando uma direção. Ícones simples (🎤 🎧 🔄), label "app traduz" no arrow.
- Footer: "Começar →" (primário). Sem "Voltar" no passo 1.

**Interações:** "Começar →" route → `/wizard/2`.

**Validações:** nenhuma — informational only.

### Passo 2 — API Key

**Conteúdo:**
- Heading: `t('setup.key.heading')` → "Sua chave da OpenAI"
- Sub: `t('setup.key.sub')` → "Cada usuário traz a própria chave. Custo: ~$0.30 por 5 minutos de conversa."
- Input field (password type) com placeholder `sk-proj-...`
- Mensagem inline ao digitar/colar: validação básica `startsWith('sk-')`
- Link clicável: `t('setup.key.signupLink')` → "Não tenho chave — me leve pro signup OpenAI" → opens `https://platform.openai.com/api-keys` no browser default
- Collapsible "Como pegar a chave?" → 3 screenshots numerados (1. signup OpenAI, 2. billing setup, 3. create API key)
- Footer: "← Voltar / Salvar e avançar →"

**Validações:** key não vazia + `startsWith('sk-')`. Chama `rt.setApiKey(value)` (existing IPC). Erro mostrado inline se safeStorage falhar.

### Passo 3 — VB-CABLE A+B

**Conteúdo (estado: detectado):**
- Heading: `t('setup.cables.detectedHeading')` → "VB-CABLE A+B detectados ✓"
- Sub: "Pronto pra rotear áudio entre você e o Meet."
- Footer: "← Voltar / Avançar →"

**Conteúdo (estado: faltando):**
- Heading: `t('setup.cables.missingHeading')` → "Você precisa instalar VB-CABLE A+B"
- Sub: "É um par de cabos de áudio virtuais. Software de terceiros (donationware), seguro e amplamente usado."
- Botão grande primário: "Baixar VB-CABLE A+B" → opens `https://vb-audio.com/Cable/index.htm#DownloadCableAB`
- Collapsible "Como instalar?" → 4 screenshots numerados (1. download, 2. extract, 3. run installer as admin, 4. reboot)
- Botão secundário: "Já instalei, re-detectar"
- Footer: "← Voltar" (sem Avançar até detectar)

**Validações:** ao clicar "Re-detectar", chama `rt.listDevices()` e checa `devices.cableA && devices.cableB`. Se OK → muda pra estado detectado e libera "Avançar →". Se ainda faltar → toast "Não detectei. Reiniciou o PC após instalar?".

### Passo 4 — Devices

**Conteúdo:**
- Heading: `t('setup.devices.heading')` → "Seus dispositivos de áudio"
- Sub: "Selecione qual mic e fone você usa."
- 4 dropdowns:
  - **Microfone (sua voz)** — todos audioinput exceto cabos
  - **Saída pro Meet** — auto-recommend `CABLE-A Input` ✓
  - **Captura do Meet** — auto-recommend `CABLE-B Output` ✓
  - **Fone (você ouve a tradução)** — todos audiooutput exceto cabos
- Idioma source/target dropdowns (PT ↔ EN default, mas user pode trocar — usa LANGUAGES de 72)
- Footer: "← Voltar / Avançar →"

**Validações:** todos 4 devices selecionados E source ≠ target. Salva via `rt.saveDevices(...)` + `rt.saveLanguages(...)`.

### Passo 5 — Configurar Meet

**Conteúdo:**
- Heading: `t('setup.meet.heading')` → "Configurar o Google Meet"
- Sub: "Esse passo é manual — não conseguimos verificar automaticamente, mas é rápido."
- 5 screenshots numerados (assets/setup/meet-step-{1..5}.png) com legendas:
  1. Abra qualquer reunião no Meet
  2. Clique no ⋮ canto superior direito → Configurações
  3. Aba "Áudio"
  4. Microfone: selecione `CABLE-A Output (VB-Audio Cable A)`
  5. Alto-falantes: selecione `CABLE-B Input (VB-Audio Cable B)` ⚠ NÃO o "16ch"
- Checkbox: "Já configurei" — habilita "Avançar →"
- Footer: "← Voltar / Avançar →"

**Validações:** checkbox marcado → libera Avançar. Chama nada (manual step).

### Passo 6 — Test Translation

**Conteúdo:**
- Heading: `t('setup.test.heading')` → "Testar tradução"
- Sub: "Vamos validar que tudo funciona com 2 calls curtas pra OpenAI (~$0.10 total). Pular se quiser, mas pode falhar na primeira chamada se algo tiver mal configurado."
- 2 cards lado a lado:
  - **Direction A (PT→EN):** "App vai falar uma frase em português, traduzir pra inglês, e validar que o cabo recebe."
    - Status badge: idle / running / success / failure
    - Botão "Testar PT → EN"
  - **Direction B (EN→PT):** "App vai falar uma frase em inglês, traduzir pra português, e tocar no seu fone."
    - Status badge: idle / running / success / failure  
    - Botão "Testar EN → PT"
- Após ambos passarem (ou skip): footer mostra "Concluir setup →" (primário)
- Footer alternativo: "Pular e abrir barra" (ghost) — mostra warning tooltip
- Footer: "← Voltar / Concluir setup →"

**Direction A test (programmatic):**
1. App carrega `assets/test/test-pt.wav` (frase curta PT, ~3s)
2. Cria temp Session A → injeta WAV chunks via `appendAudio()` (bypass offscreen mic capture)
3. Output EN PCM volta via `onAudio` event
4. App roteia output pra `CABLE-A Input` via temp playback (setSinkId)
5. Em paralelo: app cria captura de `CABLE-A Output` (loopback dentro do app)
6. Se loopback recebeu áudio dentro de 10s → Pass. Se silêncio → Fail com mensagem "Não detectei áudio voltando do CABLE-A. Verifique se VB-CABLE A está instalado corretamente."
7. Tear down session + capture

**Direction B test (auditory):**
1. App carrega `assets/test/test-en.wav` (frase curta EN, ~3s)
2. Cria temp Session B → injeta WAV via appendAudio
3. Output PT PCM volta via `onAudio`
4. App toca PCM no headset selecionado via setSinkId
5. UI prompt: "Ouviu uma frase em português? [Sim, ouvi] [Não ouvi nada]"
6. User click → marca pass/fail

**Skip path:** "Pular" → toast "Atenção: tradução pode falhar na primeira chamada se algo tiver mal configurado" → routes to bar (markSetupComplete fires).

## 5. Review screen (subsequent mode)

**Conteúdo:**
- Heading: `t('review.heading')` → "Configurações"
- Sub: `t('review.sub')` → "Tudo já configurado. Edite o que precisar."
- 5 sections (cards verticais):

| # | Section | Status icon | Value | Edit action |
|---|---|---|---|---|
| 1 | OpenAI API Key | ✓ ok | `●●●●A4f9 · safeStorage` | Editar → `/wizard/2` |
| 2 | VB-CABLE A · B | ✓ ok / ! warn | "Detectados" / "Não detectados" | Re-detectar → `/wizard/3` |
| 3 | Idiomas | ✓ ok | `PT ↔ EN` | Editar → `/wizard/4` (foca dropdowns de idiomas) |
| 4 | Dispositivos | ✓ ok | `Mic: USB · ToMeet: CABLE-A · ...` | Editar → `/wizard/4` |
| 5 | Configurar Meet | ! warn (sempre) | "Verifique manualmente" | Ver guia → `/wizard/5` |

- Footer:
  - Esquerda: "Sair do app" (ghost destrutivo)
  - Direita: "Testar tradução" (secundário) + "Fechar" (primário, fecha SetupView)

**Comportamento:**
- Click "Editar" em qualquer section → routes pra `/wizard/N` em modo edit (footer = "Voltar / Salvar e voltar")
- "Salvar e voltar" → persiste mudança + routes back to `/review`
- "Testar tradução" → reabre passo 6 do wizard em modo standalone, com botão "Voltar pra config" no footer
- "Fechar" → closes SetupView window
- "Sair do app" → calls `rt.quit()` (existing M3 IPC)

## 6. i18n architecture

### File structure

```
src/shared/i18n/
├─ locales/
│  ├─ pt-BR.json    # source (Brazilian Portuguese)
│  └─ en-US.json    # translation (American English)
├─ types.ts         # generated/inferred TranslationKey type
└─ index.ts         # I18nProvider, useT, resolveLocale
```

### Locale file shape

```json
{
  "setup": {
    "welcome": {
      "heading": "Vamos te configurar em ~5 minutos",
      "sub": "O Realtime Translate traduz suas conversas..."
    },
    "key": {
      "heading": "Sua chave da OpenAI",
      "signupLink": "Não tenho chave — me leve pro signup",
      ...
    },
    ...
  },
  "bar": {
    "tooltips": {
      "play": "Iniciar tradução",
      "pause": "Pausar tradução",
      ...
    }
  },
  "review": { ... },
  "errors": { ... }
}
```

### API

```typescript
// Provider — wraps both renderer entry points (FloatingWidget AND SetupView)
<I18nProvider locale={resolveLocale()}>
  <App />
</I18nProvider>

// Hook for components
const t = useT();
t('setup.welcome.heading');                    // → string
t('setup.test.cost', { amount: '0.10' });      // → "Custo: ~$0.10" with var substitution
```

### Type safety

`TranslationKey` é derivado da estrutura do JSON via TypeScript template literal types (recursivo). Garante que `t('setup.welcome.bogus')` fail at compile time. Implementação simples; não precisa de codegen.

### Variable substitution

Format: `{{varName}}` no JSON. Library substitui em runtime. Chaining/pluralization fora do MVP — se precisar pluralization futura, migrar pra react-intl ou i18next.

### Resolução do locale

```typescript
function resolveLocale(): 'pt-BR' | 'en-US' {
  // 1. User override em prefs
  const override = prefsStore.load().uiLanguage;
  if (override && SUPPORTED_LOCALES.includes(override)) return override;
  
  // 2. OS locale
  const osLocale = app.getLocale(); // 'pt-BR', 'en-US', 'es-ES', ...
  if (SUPPORTED_LOCALES.includes(osLocale)) return osLocale;
  
  // 3. Fallback
  return 'en-US';
}
```

`SUPPORTED_LOCALES = ['pt-BR', 'en-US']` para o MVP.

### Adicionando uma nova língua (futuro)

Trivial — copiar `pt-BR.json` → `es-ES.json`, traduzir valores, adicionar `'es-ES'` ao `SUPPORTED_LOCALES`. Sem mudança de código.

## 7. Window architecture changes from M3

M3 já tem SetupView como BrowserWindow lazy. Esta spec NÃO muda a estrutura de janelas — só substitui o conteúdo de `setup-view.html` / `SetupViewStub.tsx` por:

```
src/renderer/views/setup/
├─ SetupRoot.tsx              # decides /wizard or /review based on isSetupComplete + URL
├─ wizard/
│  ├─ WizardShell.tsx         # progress bar, titlebar, language dropdown, footer
│  ├─ Step1Welcome.tsx
│  ├─ Step2ApiKey.tsx
│  ├─ Step3Cables.tsx
│  ├─ Step4Devices.tsx
│  ├─ Step5MeetConfig.tsx
│  ├─ Step6TestTranslation.tsx
│  └─ AudioFlowDiagram.tsx    # used by Step1
├─ review/
│  ├─ ReviewScreen.tsx
│  └─ ReviewSection.tsx
└─ shared/
   ├─ LanguageDropdown.tsx    # i18n selector (top-right of titlebar)
   ├─ TestTranslation.tsx     # shared component used by Step6 + review "Testar" button
   └─ MeetGuide.tsx           # 5 screenshots used by Step5 + review's "Ver guia"
```

`SetupRoot.tsx` substitui `SetupViewStub.tsx`. Routing usa **hash-based simples** (`#/wizard/2`, `#/review`) — `useState` + listener em `hashchange`. Sem dependência de React Router (overhead desnecessário pra 7 rotas).

**SetupViewStub.tsx é deletado** após esta implementação.

## 8. Persistência (prefs.json)

Novos campos:

```typescript
interface UserPrefs {
  // existentes
  widgetPosition?: WidgetPosition;
  languages?: Languages;        // PT/EN translation source/target
  devices?: DevicePrefs;
  
  // novo (M4)
  uiLanguage?: 'pt-BR' | 'en-US';
}
```

`UserPrefsStore` ganha:

```typescript
setUiLanguage(locale: 'pt-BR' | 'en-US'): void;
```

E IPC:
- `IPC.PrefsSetUiLanguage`: `{ args: 'pt-BR' | 'en-US'; result: void }`

## 9. Test Translation — implementação técnica

### Direction A (loopback validation)

```typescript
// src/renderer/views/setup/shared/TestTranslation.tsx
async function testDirectionA(): Promise<TestResult> {
  // 1. Load WAV file as raw PCM16
  const wavData = await loadTestWav('test-pt.wav');  // bundled in assets/
  const pcmChunks = chunkPcm(wavData, 50);  // 50ms chunks like the live mic
  
  // 2. Open temp Session A via existing IPC
  await rt.testSessionStart({ direction: 'A', sourceLang: 'pt', targetLang: 'en' });
  
  // 3. Inject PCM chunks (new IPC: testSessionInject)
  for (const chunk of pcmChunks) {
    await rt.testSessionInject({ direction: 'A', base64: chunk });
  }
  await rt.testSessionMarkInputDone({ direction: 'A' });  // signal end of audio
  
  // 4. Open loopback capture from CABLE-A Output (recording side of CABLE-A)
  const loopback = await rt.startLoopbackCapture({ deviceId: cableAOutputDeviceId });
  
  // 5. Wait for output_audio.delta from session, route to CABLE-A Input
  //    (already happens via existing pipeline, just need the ROUTE to be CABLE-A Input)
  
  // 6. Wait up to 10s for loopback to detect audio above threshold
  const result = await loopback.waitForAudio({ thresholdRms: 0.01, timeoutMs: 10000 });
  
  // 7. Tear down
  await rt.testSessionStop({ direction: 'A' });
  await loopback.stop();
  
  return { passed: result.detected, message: result.detected ? '...' : 'No audio from CABLE-A' };
}
```

**New IPCs** (Test Translation only, not used by main bar flow):
- `testSessionStart(direction, source, target)` — opens isolated OpenAISession
- `testSessionInject(direction, base64)` — feeds PCM chunks
- `testSessionMarkInputDone(direction)` — signals input is complete (server can finalize translation)
- `testSessionStop(direction)` — close
- `startLoopbackCapture(deviceId)` — opens offscreen capture on a device
- `loopback.waitForAudio(opts)` — blocks until threshold met or timeout

### Direction B (auditory validation)

```typescript
async function testDirectionB(): Promise<TestResult> {
  const wavData = await loadTestWav('test-en.wav');
  const pcmChunks = chunkPcm(wavData, 50);
  
  await rt.testSessionStart({ direction: 'B', sourceLang: 'en', targetLang: 'pt' });
  
  for (const chunk of pcmChunks) {
    await rt.testSessionInject({ direction: 'B', base64: chunk });
  }
  await rt.testSessionMarkInputDone({ direction: 'B' });
  
  // Existing pipeline routes Direction B output to selectedHeadset via setSinkId
  // No loopback needed — user validates by ear
  
  // UI prompt: "Did you hear the Portuguese phrase?"
  const userAnswer = await promptUser('test.directionB.confirm');
  
  await rt.testSessionStop({ direction: 'B' });
  
  return { passed: userAnswer === 'yes', message: '...' };
}
```

### Test WAV files

- `assets/test/test-pt.wav` — frase curta em PT-BR. Ex: "Olá, isto é um teste de tradução." (~3s, PCM16 24kHz mono)
- `assets/test/test-en.wav` — frase curta em EN. Ex: "Hello, this is a translation test." (~3s, PCM16 24kHz mono)
- Bundled em `assets/`, copiados pra build via electron-builder/vite asset handling
- Geração: TTS único (ex: ElevenLabs ou macOS `say` command), commit os 2 arquivos, ~50KB total

### Custo por test

- Direction A: ~3s input PT audio (input cost ~$0.003) + ~3s output EN audio (output cost ~$0.012) = ~$0.015
- Direction B: ~3s input EN audio + ~3s output PT audio = ~$0.015
- Total per Test Translation run: ~**$0.03**

(Briefing original mencionou $0.05-0.10 que cobre overhead de WS open + pings — conservador estimate é fine.)

## 9.1. Cost dashboard live (FloatingWidget)

Cross-cutting addition à barra (não SetupView): exibe custo acumulado da sessão ativa em tempo real.

### Visual

Tag `$0.42` em mono dim, posicionada após o LatencyMeter na ordem dos elementos da barra. Aparece apenas quando `bar.kind === 'active'`. Estilo idêntico ao latency tag mas cor mais apagada (`var(--text-tertiary)` em vez de `rgba(244,244,245,0.5)`) — economia de proeminência visual já que latency é mais útil instante-a-instante.

```
[ • ▌▌▌▌▌▌  PT ↔ EN  1.2s  $0.42  ⏸  ⚙ ]
                       ↑      ↑
                   latency  cost (dim)
```

Largura adicional: ~50px. Total active bar: ~340px.

### Cálculo

```typescript
const RATE_PER_SESSION_MIN = 0.034;  // USD per minute per session

function computeCost(stateA: SessionState, stateB: SessionState, now: number): number {
  let totalSessionMinutes = 0;
  if (stateA.kind === 'active') totalSessionMinutes += (now - stateA.sinceMs) / 60000;
  if (stateB.kind === 'active') totalSessionMinutes += (now - stateB.sinceMs) / 60000;
  return totalSessionMinutes * RATE_PER_SESSION_MIN;
}
```

Bidirectional ativa = 2 sessões = $0.068/min combinado. Pause/Resume reseta cada `sinceMs` ao reentrar em `active`, então cost reflete a sessão ATUAL apenas (não soma sessões anteriores). Limpar acúmulo histórico fica out of scope.

### Refresh rate

`setInterval(1000ms)` no FloatingWidget força re-render. Cleanup ao unmount (`return () => clearInterval(id)`).

Custo computacional: cheap. 1 timer + 1 setState/segundo. Não há IPC nem rede.

### Display format

- `< $0.10` → `$0.05` (2 decimais)
- `≥ $0.10` → `$0.42` (2 decimais)
- Ultrapassa `$10`? → `$12.34` ainda em 2 decimais (formato cresce sem quebrar)

Decisão: sempre 2 decimais, formato `$X.XX`. Mono font garante alinhamento consistente.

### Reset semantics

Cost é per-sessão, não acumulado. Quando user clica ⏸ pause:
- `stateA.kind` vira `idle` → contribui 0 ao cálculo
- Custos da sessão recém-encerrada não são lembrados

Quando user clica ▶ resume:
- Nova sessão start → novo `stateA.sinceMs` → cost começa de $0.00
- Sessão anterior é "esquecida"

Justificativa: cost dashboard é affordance pra controle DURANTE uma chamada ("estou indo muito longe?"). Acumulação histórica seria útil mas é out of scope (M5+: custo por dia/semana/mês com agregação).

### Acceptance criteria (cost)

- [ ] Cost tag aparece em active state, some em idle/connecting/reconnecting/error
- [ ] Cost atualiza visualmente a cada segundo (~1Hz)
- [ ] Bidirectional ativo = 2× rate (~$0.068/min)
- [ ] Pause/Resume reseta o cost
- [ ] Format `$X.XX` consistente, mono font

---

## 10. Acceptance criteria

- [ ] First-launch (sem prefs) abre SetupView em `/wizard/1` (Welcome)
- [ ] Avançar pelo wizard sequencialmente passa pelos 6 steps
- [ ] "Voltar" retrocede sem perder state já preenchido
- [ ] Concluir setup (passo 6 completo OR skip) → bar appears, SetupView closes
- [ ] Subsequente: clicar ⚙ na barra → SetupView abre em `/review`
- [ ] Review screen mostra status correto de cada section (✓/!)
- [ ] "Editar" em qualquer section → routes pra step do wizard em edit mode
- [ ] "Salvar e voltar" no edit mode persiste e routes back pra `/review`
- [ ] Dropdown de idioma (titlebar) muda UI inteira instantly + persiste em `prefs.uiLanguage`
- [ ] Auto-detect respeita `app.getLocale()` no first-launch (fallback EN)
- [ ] Strings PT-BR e EN-US ambas completas (~80-100 chaves)
- [ ] VB-CABLE missing detection: botão Avançar disabled, "Re-detectar" funciona
- [ ] Test Translation Direction A: detecta áudio no loopback de CABLE-A em <10s OR fail visível
- [ ] Test Translation Direction B: prompt "Sim, ouvi"/"Não ouvi"; user click reflete pass/fail
- [ ] Test Translation Skip: avança pra Concluir com warning toast
- [ ] Welcome diagram renderiza sem layout shift, ícones simples
- [ ] Meet guide renderiza 5 screenshots ordenados, com legendas
- [ ] "Sair do app" no review footer chama `rt.quit()` (existing M3 IPC)
- [ ] BidirectionalTestRig content removido do SetupViewStub (file deletado)
- [ ] tsconfig + lint clean; testes ≥ 90 (i18n hooks + locale resolver + step routing testáveis)

## 11. Out of scope (M4)

- **Mais línguas** além de PT-BR + EN-US (defer pra contributions futuras; arquitetura permite trivial add)
- **Tradução automatizada via LLM** — strings escritas à mão pra qualidade
- **Live transcript display** durante sessão ativa (era originalmente cogitado pra SetupView; defer pra M5)
- **Export logs** button — defer
- **Cost dashboard histórico** (acumulação por dia/semana/mês com agregação) — defer M5+. MVP é cost LIVE da sessão atual apenas (§9.1)
- **Animated GIFs** pro Meet guide — usa screenshots estáticos pro MVP
- **Tour interativo** in-bar — fora de scope, wizard é first-launch only
- **Onboarding video** — out of scope
- **Pluralization / ICU MessageFormat** — sem MVP need; var substitution simples é suficiente
- **RTL languages** (Arabic, Hebrew) — não no MVP; CSS pode cuidar via `dir="rtl"` quando se for adicionar
- **Atualização in-app de VB-CABLE** — out of scope; user vai pro browser

## 12. Riscos & mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Test Translation Direction A loopback false-negative | Médio (user assume tudo quebrado) | Threshold RMS calibrado em smoke test. Mensagem de erro acionável ("verifique se VB-CABLE A está instalado") |
| Translations PT/EN ficam fora de sync (edits no PT esquecem o EN) | Médio | TS template literal types pegam chaves faltantes em compile-time. CI test que valida ambos JSONs têm mesmas chaves |
| `app.getLocale()` retorna locale não-suportado (ex: pt-PT) | Baixo | Tratamento exato — fallback EN. pt-PT ≠ pt-BR pra ser preciso. Documentar |
| user-OS locale muda entre launches (raro) | Baixo | `prefs.uiLanguage` overrides; user controla |
| Screenshots do Meet ficam outdated quando Google muda UI | Médio | Versionar com commit, atualizar manualmente quando reportado. Não há solução automática |
| WAV files muito grandes pro bundle | Baixo | 2 × ~50KB = 100KB, negligível. Inline base64 não recomendado, mas asset bundle handles |
| Wizard com 6 steps fica enjoativo pra dev (que reinstala muito) | Baixo | Edit mode (via review) cobre — dev pula direto pro step relevante |

## 13. Implementação — pontos de atenção

- **Hash-based routing** evita dep de React Router. `useEffect` lê `window.location.hash` e renderiza step apropriado. Navigation via `window.location.hash = '#/wizard/3'`.
- **Edit mode awareness:** cada step recebe `mode: 'wizard' | 'edit'` via prop. Footer renderiza buttons diferentes baseado em mode.
- **Form state** dos steps fica em React state local + persiste em prefs ao Avançar. Volta repopula.
- **AudioFlowDiagram** é SVG inline OR div+CSS — não precisa de imagem externa pra ele. Usa ícones unicode/emoji (🎤 🎧) ou Lucide icons (já é dep).
- **Meet guide screenshots** vão em `assets/setup/meet-step-{1..5}.png`. Bundled via electron-vite asset handler. Precisa criar essas 5 imagens (manual screenshot work — deferred ao implementador).
- **Test WAV files** vão em `assets/test/`. Geração inicial: usar TTS one-shot (ElevenLabs API ou macOS `say -v Luciana "Olá..." -o test-pt.wav`). Committar binários (~50KB cada).
- **i18n provider runs in BOTH renderer entry points** (floating-main.tsx + setup-main.tsx). Wraps each respective root.
- **TestTranslation component** é shared entre Step6 e Review screen "Testar tradução" button — same implementation, different host.

## 14. Referências

- Spec original: [2026-05-07-realtime-translate-design.md](2026-05-07-realtime-translate-design.md) — §6 Setup, §9 Design language, §11 Out of scope
- Spec FloatingWidget: [2026-05-08-realtime-translate-m3-floatingwidget.md](2026-05-08-realtime-translate-m3-floatingwidget.md) — §10 SetupView reference
- Mockup design system: [docs/design/design-system.html](../../design/design-system.html) — seção SetupView (style baseline)
- Brainstorm visuals (sessão 2026-05-08, gitignored em `.superpowers/brainstorm/`):
  - `flow-shape.html` (3 fluxos: dashboard / wizard / hybrid — chosen B = wizard)
  - `setup-mockups.html` (Welcome + Review screen — chosen direction)

---

## Próximos passos

1. **Spec self-review** (controller, inline)
2. **User reviews** este documento, aprova ou solicita mudanças
3. **Plano de implementação** via `writing-plans` skill — provavelmente 8-12 tasks (i18n scaffolding, 6 steps, review screen, test translation, Meet guide assets)
4. **Execução** via `subagent-driven-development` — mesma cadência M3
