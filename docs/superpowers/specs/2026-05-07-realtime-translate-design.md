# Realtime Translate — Design

**Status:** approved (brainstorm fase)
**Data:** 2026-05-07
**Autor:** Gabriel (com Claude)

## 1. Objetivo

App desktop open-source que permite **tradução simultânea bidirecional** durante chamadas no Google Meet (e outros apps de videoconferência), usando o modelo `gpt-realtime-translate` da OpenAI via duas sessões WebSocket paralelas e cabos de áudio virtuais.

Caso de uso primário: profissional brasileiro participando de entrevistas/reuniões em inglês, falando português e ouvindo a tradução em tempo real, sem precisar de intérprete humano.

### Goals

- Tradução PT↔EN (e outros pares configuráveis) com latência aceitável (1-3s, limitada pelo modelo)
- Setup único de cabos virtuais; uso recorrente sem fricção
- BYOK (Bring Your Own Key): usuário traz sua própria API key da OpenAI
- Open source, Windows-first, distribuído via GitHub Releases

### Non-goals

Ver Seção 11 (Out of Scope).

## 2. Sumário de decisões

| Decisão | Escolha |
|---|---|
| Distribuição | OSS no GitHub, BYOK, sem backend nosso |
| Plataforma | Windows-first (Mac/Linux como possível v2 por contribuição) |
| Direção | Bidirecional desde o MVP (PT↔EN configurável) |
| Stack | Electron + TypeScript + React + Vite |
| Idiomas | Configuráveis via dropdown (qualquer par suportado pelo modelo) |
| Voz | Voz padrão do `gpt-realtime-translate` (sem clonagem) |
| Roteamento de áudio | 2 cabos virtuais: VB-CABLE A+B |
| API key storage | Electron `safeStorage` (DPAPI) + fallback `OPENAI_API_KEY` env var |
| UI principal | Floating widget compacto (~280×200), always-on-top, transcript expansível |
| Onboarding | Status dashboard (não-wizard linear) com Test Translation |
| Tratamento de erro | Reconnect automático por sessão; UI granular do estado |
| Testes | 4 camadas; nenhum teste depende de OpenAI ou hardware no CI |
| Design language | Premium/discreto — referências Linear, Raycast, Arc |

## 3. Arquitetura

### Visão de processos

```
┌─────────────────────────────────────────────────────────────┐
│  ELECTRON MAIN PROCESS  (Node.js — guarda API key, faz I/O) │
│                                                              │
│   ┌─────────────────┐         ┌─────────────────┐           │
│   │ SessionManager  │         │ AudioRouter     │           │
│   │  ├─ Sessão A    │         │  ├─ Mic real    │──capture  │
│   │  │  (PT→EN)     │         │  ├─ CABLE-A in  │──output   │
│   │  └─ Sessão B    │         │  ├─ CABLE-B out │──capture  │
│   │     (EN→PT)     │         │  └─ Headset out │──output   │
│   └────────┬────────┘         └────────┬────────┘           │
│            │ WebSocket                  │ Web Audio (offsc)  │
│            │ wss://api.openai.com       │                    │
│   ┌────────┴────────┐                   │                    │
│   │ OpenAI Realtime │◄──────────────────┘                    │
│   │  /translations  │                                        │
│   └─────────────────┘                                        │
│                                                              │
│   ConfigStore (safeStorage) · DeviceDetector · Logger        │
└──────────────────────┬──────────────────────────────────────┘
                       │ IPC (state + transcript events)
┌──────────────────────┴──────────────────────────────────────┐
│  RENDERER PROCESS  (UI Electron — React)                     │
│                                                              │
│   FloatingWidget (compact 280x200, always-on-top)            │
│    ├─ LanguageSelectors   ├─ StartStopButton                 │
│    ├─ StatusIndicator     ├─ LatencyMeter                    │
│    └─ TranscriptPanel (expansível)                           │
│                                                              │
│   SetupView (first-launch + diagnostics)                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  OFFSCREEN RENDERER  (sem janela, dedicado a áudio)         │
│   Web Audio API + AudioWorklets · setSinkId pra cabos       │
└─────────────────────────────────────────────────────────────┘
```

### Princípios estruturantes

1. **Main process é o único guardião da API key.** Renderer nunca recebe a key, só pede operações via IPC.
2. **Áudio I/O acontece em offscreen renderer**, não no main. Web Audio API é mais maduro que pacotes nativos Node pra resampling/PCM16/24kHz.
3. **Duas sessões WebSocket independentes.** Falha em uma não derruba a outra.
4. **AudioRouter abstrai os 4 streams** por nome lógico (`mic`, `cableA`, `cableB`, `headset`). UI nunca toca em device IDs diretamente.

## 4. Componentes

### Main process (`src/main/`)

| Módulo | Responsabilidade |
|---|---|
| `app.ts` | Boot do Electron, cria janelas, wire de IPC |
| `config/configStore.ts` | Get/set de API key (safeStorage), idiomas, devices preferidos |
| `config/envFallback.ts` | Lê `OPENAI_API_KEY` do env como fallback |
| `audio/deviceDetector.ts` | Lista devices, detecta CABLE-A/CABLE-B presentes |
| `audio/audioRouter.ts` | Cria/destrói streams; abstrai dispositivos por nome lógico |
| `translate/sessionManager.ts` | Cria, monitora e destrói as 2 sessões em paralelo |
| `translate/openaiSession.ts` | WebSocket pra `/v1/realtime/translations`, gerencia 1 sessão |
| `translate/audioPipeline.ts` | Cola mic↔openai↔cableA e cableB↔openai↔headset |
| `ipc/index.ts` | Define canais IPC tipados |
| `util/retryPolicy.ts` | Backoff exponencial pra reconnect |
| `util/logger.ts` | Log estruturado em JSONL |
| `util/pcmCodec.ts` | Encode/decode PCM16 ↔ base64 |

### Offscreen renderer (`src/offscreen/`)

| Módulo | Responsabilidade |
|---|---|
| `webAudioBridge.ts` | Expõe APIs pra main: getUserMedia, AudioContext, AudioWorklets |
| `workers/pcmEncoder.worklet.ts` | AudioWorklet pra capturar e encodar PCM16 24kHz |

### UI renderer (`src/renderer/`)

| Módulo | Responsabilidade |
|---|---|
| `App.tsx` | Roteamento entre `SetupView` e `FloatingWidget` |
| `views/SetupView.tsx` | Dashboard de diagnóstico |
| `views/FloatingWidget.tsx` | UI principal compact + transcript expansível |
| `components/LanguagePair.tsx` | Dropdowns origem/destino |
| `components/StatusBadge.tsx` | Estados visíveis (Idle / Connecting / Active / Reconnecting / Error) |
| `components/LatencyMeter.tsx` | Mostra latência média da última frase |
| `components/TranscriptPanel.tsx` | Dual transcript com auto-scroll |
| `state/store.ts` | Estado UI (Zustand) |
| `ipc/client.ts` | Wrapper tipado pros canais IPC |

### Stack

- **Electron** (last stable) + **electron-builder**
- **TypeScript** estrito
- **React + Vite** no renderer
- **`ws`** (cliente WebSocket no main)
- **Zustand** (state store)
- **vitest** (unit/integration) + **Playwright** (e2e)

### Restrição de tamanho

Nenhum módulo deve passar de ~200 linhas. Se passar, é sinal de violação de responsabilidade única e precisa ser quebrado.

## 5. Fluxo de dados

### Direção A — Você fala (PT → EN → Interlocutor)

```
[Mic real]
  → getUserMedia { deviceId: micId }
  → AudioContext 24kHz mono
  → AudioWorklet PCM16 encoder
  → IPC base64 pro main
  → WebSocket: session.input_audio_buffer.append (sessão A)
  → OpenAI gpt-realtime-translate (PT→EN)
  → session.output_audio.delta (PCM16 EN)
  → IPC pro offscreen
  → AudioContext.destination com setSinkId('cable-a-input')
  → CABLE-A virtual playback
  → Meet usa CABLE-A como mic
  → Interlocutor ouve EN
```

### Direção B — Interlocutor fala (EN → PT → Você)

```
[Meet output → CABLE-B virtual playback]
  → CABLE-B virtual recording
  → getUserMedia { deviceId: cableBOutputId }
  → AudioContext 24kHz mono
  → AudioWorklet PCM16 encoder
  → IPC base64 pro main
  → WebSocket: session.input_audio_buffer.append (sessão B)
  → OpenAI gpt-realtime-translate (EN→PT)
  → session.output_audio.delta (PCM16 PT)
  → IPC pro offscreen
  → AudioContext.destination com setSinkId('headset')
  → Headset speaker real
  → Você ouve PT
```

### Eventos de transcript (paralelos ao áudio)

Cada sessão emite:
- `session.input_transcript.delta` → painel "ORIGEM" no transcript
- `session.output_transcript.delta` → painel "DESTINO" no transcript

Esses deltas são roteados via IPC ao renderer principal e acumulados em `TranscriptPanel`.

### Configuração inicial das sessões

Após `WebSocket open`, app envia:

```javascript
// Sessão A (PT→EN)
ws.send({
  type: "session.update",
  session: {
    // No input_audio_format/output_audio_format — translation endpoint
    // does not accept those. Format is implicit PCM16 24kHz mono.
    audio: { output: { language: "en", voice: "ash" } }
  }
});
// Sessão B análoga com language: "pt"
```

### Medição de latência

Marcamos timestamps em 3 pontos:
- `t0`: primeiro chunk de áudio enviado após VAD detectar fim de fala
- `t1`: primeiro `output_audio.delta` recebido
- `t2`: primeiro chunk reproduzido no destino

UI mostra `t1 - t0` (média móvel últimos 5 turnos) como "latência de tradução".

### Mute coordenado

Ao "Iniciar":
1. App valida cabos A/B presentes
2. App abre as 2 sessões WebSocket
3. UI muda pra "Traduzindo"

App **não toca no Meet**. Usuário precisa **uma vez** configurar:
- Microfone do Meet → `CABLE-A Output`
- Speaker do Meet → `CABLE-B Input`

SetupView ensina isso com screenshots.

Ao "Parar":
1. Fecha ambos os WebSockets graciosamente
2. Drena buffers pendentes
3. UI volta ao idle

## 6. Setup & Onboarding

### Pré-requisitos checáveis

| Item | Como detecta |
|---|---|
| API Key | Existe valor em `safeStorage` ou env. Validação real só com Test Translation |
| VB-CABLE A | `enumerateDevices()` regex `/CABLE.*A.*Input/i` |
| VB-CABLE B | `enumerateDevices()` regex `/CABLE.*B.*Output/i` |
| Mic real | Lista devices excluindo CABLE-* — usuário escolhe |
| Speaker real | Idem |

### Não-checável: configuração do Meet

App **não consegue** verificar se o Meet está configurado corretamente. Setup view tem checkbox "Já configurei" + guia visual com screenshots numerados em `assets/setup/meet-step-{1..5}.png`.

### Test Translation

Botão `Testar tradução` valida o pipeline ponta-a-ponta sem precisar do Meet:

**Test EN→PT (Sessão B):**
1. App reproduz arquivo pré-gravado `assets/test/test-en.wav` (frase curta em inglês) num device dummy capturado pela Sessão B
2. Espera áudio PT chegar no headset selecionado
3. ✓ valida: API key, Sessão B, roteamento até headset

**Test PT→EN (Sessão A):**
1. App reproduz arquivo pré-gravado `assets/test/test-pt.wav` (frase curta em português) simulando captura do mic
2. Sessão A traduz pra EN, app injeta no CABLE-A
3. App captura de CABLE-A output (loopback dentro do próprio app) e verifica que áudio chegou
4. ✓ valida: API key, Sessão A, roteamento até CABLE-A

**Por que arquivos pré-gravados:** Web Speech TTS em Electron é instável (depende de SAPI do Windows, vozes podem não estar instaladas). WAVs pré-gravados são determinísticos e fazem parte do bundle.

Falha em qualquer teste mostra erro específico (key inválida / cabo não recebe / network / device errado).

Test é opcional mas recomendado. Usuário pode "Continuar" sem testar (warning: "Tradução pode falhar na primeira chamada se algo estiver mal configurado").

### Aberturas subsequentes

Se todos os checks passam → vai direto pro widget. Botão Settings no widget reabre SetupView se algo quebrar.

## 7. Tratamento de erros

### Categorias

#### Configuração (antes de iniciar)
- API key ausente/inválida → bloqueia "Iniciar", abre SetupView com campo destacado
- Cabo virtual ausente → bloqueia, link de download
- Device de mic/speaker indisponível mid-session → pausa sessão, prompt pra reescolher

#### Rede / WebSocket
- Drop inesperado → reconnect automático com backoff exp (1s, 2s, 4s, 8s, max 30s). Status "Reconectando..."
- Falha inicial após 3 tentativas → erro fatal, status "Sem conexão"
- Timeout > 30s sem evento → fecha e reconecta
- Rate limit (429) → mensagem clara + tempo de espera, sem retry automático
- Erro 5xx persistente > 1min → "Servidor OpenAI instável"

**Cada sessão tem retry state independente.** Sessão A reconectando não bloqueia B.

#### Áudio
- Mic permission negada → mensagem + link de configurações Windows
- AudioContext suspended → tenta `resume()` automaticamente
- Underrun > 5/min → warning amarelo
- Cable device some → pausa sessão afetada, oferece pause/cancel

#### Modelo OpenAI
- Event `error` transient → continua
- Event `error` fatal → fecha sessão e mostra
- Long silence sem `output_audio.delta` (>15s mas usuário falou) → "Modelo demorando" amarelo

### Estados do `StatusBadge`

| Estado | Tom visual | Quando |
|---|---|---|
| `Idle` | neutro discreto | App aberto, tradução não iniciada |
| `Connecting` | accent suave | WebSocket abrindo |
| `Active` | accent firme | Pelo menos uma sessão recebendo deltas |
| `Reconnecting` | accent pulsante | Após drop, tentando reconectar |
| `Error` | warning | Falha não-recuperável |

Quando uma sessão OK e outra com erro, badge mostra split: `A · ●` / `B · ⚠`.

### Logs

- Estruturado em `%APPDATA%/realtime-translate/logs/<session-id>.jsonl`
- Schema: `{ ts, level, source, event, data }`
- **Não loga áudio nem transcripts** (privacidade)
- Botão "Export logs" no Settings pra debug
- Rotação: últimos 7 dias

### Modos degradados

Se Sessão A falha mas B funciona → modo "só ouvir tradução": você ainda escuta interlocutor traduzido, sua voz não é mais traduzida pra ele. Status mostra explicitamente. Meio funcional > nada.

### Princípios

1. Falha de rede ≠ falha do app — reconnect silencioso
2. Erros do usuário (config) sempre acionáveis com botão de fix
3. Logs nunca vazam dados sensíveis
4. Independência entre sessões evita falha cascata

## 8. Estratégia de testes

### Pirâmide

```
        Manual / Smoke     ← OpenAI + Meet reais, pre-release
       ──────────────────
       E2E (Playwright)    ← UI flow + IPC + OpenAI mockado
      ────────────────────
      Integration (vitest) ← SessionManager + AudioRouter + fakes
     ──────────────────────
     Unit (vitest)         ← módulos puros
```

### Unit
Alvos: `pcmCodec`, `deviceDetector` (regex labels), `retryPolicy`, `configStore` (safeStorage mock + env fallback), parsers de eventos. Coverage ≥85%.

### Integration
- `sessionManager` com 2 sessões; uma falha; outra continua; reconnect bem-sucedido
- `audioPipeline` reordena `output_audio.delta` fora-de-sequência
- IPC: renderer manda `start`, main responde com state transitions corretos
- Fake WebSocket configurável (open/close/error/delays)
- Fake AudioContext que captura buffers

### E2E (Playwright)
- Setup happy path (cabos mockados → "Continuar")
- Setup com cabo faltando (link download, "Continuar" bloqueado)
- Test Translation success
- Iniciar/Parar com transitions corretas
- Reconnect visual (badge muda)

OpenAI mockado via fixtures: gravações JSON de sessões reais salvas em `tests/e2e/fixtures/`.

### Manual / Smoke (pre-release)
Documentado em `docs/QA-CHECKLIST.md`:
- Install zero numa máquina Windows fresh com VB-CABLE real
- Entrevista mock 5min cada direção
- Network throttling
- Reconnect real (desligar WiFi 10s)
- 3 devices diferentes (USB, BT, jack)

### Não testamos automaticamente
- Qualidade de tradução (subjetivo)
- Latência real (depende de hardware/rede)
- Comportamento do Meet em si

### CI (GitHub Actions)
- `lint` + `typecheck` em cada push
- `unit` + `integration` em cada PR
- `e2e` em PR (Playwright headless)
- `package-windows` em tag/release
- **Nenhum teste contra OpenAI real**

### Princípio
Nenhum teste depende da OpenAI ou de hardware real, exceto o smoke manual. Contribuidor abre PR sem custo.

## 9. Design language

**Constraint vinculante:** UI deve ser premium e discreta. Referências: **Linear, Raycast, Arc, Things 3**. Anti-referências: dashboards SaaS genéricos, Bootstrap defaults, Material Design out-of-the-box.

### Princípios visuais

1. **Restraint over decoration.** Whitespace é decoração. Bordas e cores devem ganhar o direito de existir.
2. **Uma cor de accent.** Um tom (provável: um azul-acinzentado ou um verde sóbrio) usado pra estados ativos. Resto da UI é grayscale.
3. **Tipografia do sistema** + Inter/Geist Sans como fallback. Hierarquia por peso e tamanho, não por cor.
4. **Sem emojis como UI elements.** Status, botões, badges usam ícones (Lucide ou Phosphor) ou texto.
5. **Sem gradientes** nas surfaces principais. No máximo gradiente sutilíssimo no botão primário.
6. **Bordas sparingly.** Prefira separar por spacing ou por shift de background tone.
7. **Microcopy terso e confiante.** "Iniciar tradução", não "Clique aqui pra começar a traduzir agora!".
8. **Dark mode primeiro.** Light como segunda opção.

### Paleta (cravada — referência: `docs/design/design-system.html`)

```
Canvas                #08090a   /* fundo da janela */
Background base       #0a0a0b   /* base da app */
Surface               #131517   /* cards, widget body */
Surface elevated      #1a1d20   /* hover de surface */
Surface overlay       #202428   /* hover de surface elevated */
Border subtle         #1f2226   /* divisores discretos */
Border default        #2a2e34   /* contorno de input/button */
Border strong         #3a3f47   /* contorno em focus */

Text primary          #f4f4f5
Text secondary        #a1a1aa
Text tertiary         #71717a
Text quaternary       #52525b

Accent                #6e7fc4   /* Indigo muted — opção A */
Accent hover          #8290d0
Accent muted          rgba(110, 127, 196, 0.14)   /* highlights, focus rings */
Accent border         rgba(110, 127, 196, 0.32)

Success               #4ade80
Warning               #f59e0b
Error                 #f87171
```

**Light mode:** fora do MVP. Adicionar como follow-up se houver demanda.

### Spacing

Grid de 4px. Componentes seguem múltiplos: 4, 8, 12, 16, 24, 32, 48.

### Animações

Curtas (150-200ms), easing natural (`ease-out`). Sem bounce. Animação serve a função, nunca a "vibe".

### Validação

Antes de cravar uma versão final do widget, mockar em alta fidelidade no Figma (ou direto no React) e comparar lado-a-lado com Linear/Raycast — se "parece com X mas pior", iterar.

## 10. Estrutura de diretórios

```
realtime-translate/
├─ package.json
├─ electron-builder.yml
├─ tsconfig.json
├─ vite.config.ts
│
├─ src/
│  ├─ main/
│  │  ├─ app.ts
│  │  ├─ config/
│  │  │  ├─ configStore.ts
│  │  │  └─ envFallback.ts
│  │  ├─ audio/
│  │  │  ├─ deviceDetector.ts
│  │  │  └─ audioRouter.ts
│  │  ├─ translate/
│  │  │  ├─ sessionManager.ts
│  │  │  ├─ openaiSession.ts
│  │  │  └─ audioPipeline.ts
│  │  ├─ ipc/
│  │  │  ├─ index.ts
│  │  │  └─ channels.ts
│  │  └─ util/
│  │     ├─ retryPolicy.ts
│  │     ├─ logger.ts
│  │     └─ pcmCodec.ts
│  │
│  ├─ offscreen/
│  │  ├─ index.html
│  │  ├─ webAudioBridge.ts
│  │  └─ workers/
│  │     └─ pcmEncoder.worklet.ts
│  │
│  ├─ renderer/
│  │  ├─ index.html
│  │  ├─ main.tsx
│  │  ├─ App.tsx
│  │  ├─ views/
│  │  │  ├─ SetupView.tsx
│  │  │  └─ FloatingWidget.tsx
│  │  ├─ components/
│  │  │  ├─ LanguagePair.tsx
│  │  │  ├─ StatusBadge.tsx
│  │  │  ├─ LatencyMeter.tsx
│  │  │  └─ TranscriptPanel.tsx
│  │  ├─ state/
│  │  │  └─ store.ts
│  │  ├─ ipc/
│  │  │  └─ client.ts
│  │  └─ styles/
│  │     ├─ theme.css
│  │     └─ tokens.css
│  │
│  └─ shared/
│     ├─ types.ts
│     ├─ events.ts
│     └─ languages.ts
│
├─ assets/
│  ├─ icon.ico
│  ├─ setup/
│  │  ├─ meet-step-1.png
│  │  └─ ...
│  └─ test/
│     ├─ test-en.wav        # Test Translation EN→PT
│     └─ test-pt.wav        # Test Translation PT→EN
│
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  └─ e2e/
│     └─ fixtures/
│
├─ docs/
│  ├─ QA-CHECKLIST.md
│  └─ superpowers/
│     └─ specs/
│
└─ .github/
   └─ workflows/
      ├─ ci.yml
      └─ release.yml
```

## 11. Riscos e mitigações

Risk-list explícita, ordenada por probabilidade × impacto:

### 1. `setSinkId` em offscreen renderer pode não funcionar com cabos virtuais
**Impacto:** alto (arquitetura depende disso)
**Mitigação:** spike de validação no Day 1 do roadmap. Plano B: `naudiodon` (Node nativo) pra playback direto. Plano C: pacote Electron específico pra audio output (`electron-audio-loopback`).

### 2. Latência percebida com 2 saltos OpenAI pode ser frustrante
**Impacto:** médio (UX, não funcional)
**Mitigação:** medir e mostrar transparente via `LatencyMeter`. Documentar expectativa ("1-3s típico") na readme.

### 3. Eco/feedback se usuário confunde devices
**Impacto:** alto (deixa app inutilizável até resolver)
**Mitigação:** SetupView verifica que CABLE-A e CABLE-B estão em pares opostos (input do A não é output do B etc.). Test Translation pega isso.

### 4. VB-CABLE pode mudar nome de devices entre versões
**Impacto:** baixo (regex permissivo cobre)
**Mitigação:** `deviceDetector` com regex permissivo, testes pra labels históricos conhecidos.

### 5. OpenAI API instável (modelo recém-lançado)
**Impacto:** médio (formato pode mudar)
**Mitigação:** versionamento contra pinned model name se OpenAI suportar. Issue tracker pra acompanhar mudanças do API.

### 6. Code signing no Windows
**Impacto:** baixo-médio (SmartScreen warning)
**Mitigação:** documentar nas docs. Caminho de upgrade: certificado de code signing eventualmente.

## 12. Out of scope

Explicitamente fora do MVP:

- **Voice cloning** — outra API key, latência extra, sem benefício pra entrevista profissional
- **Mac/Linux** — Windows-first, comunidade pode contribuir
- **Múltiplas conversas simultâneas** — 1 chamada de cada vez
- **Integração nativa com Meet** — sem extensão Chrome, sem API. Funciona com qualquer app que aceita device de mic
- **Persistência de transcript** — sessão ativa apenas, histórico é v2
- **Tradução de texto digitado** — só áudio
- **Auth multiusuário** — BYOK single user
- **Telemetry/analytics** — zero. Privacy-first
- **Push-to-talk** — VAD do modelo é suficiente
- **Auto-update** — fora do MVP, mas trivial adicionar via electron-updater + GitHub releases

## 13. Decisões deferidas

A decidir durante implementação:

- **State store** (Zustand recomendado, mas pode ser Valtio)
- **Bibliotecas de ícones** (Lucide preferida — alinhada com Linear/Tailwind aesthetic)
- **Estratégia de auto-update** (electron-updater) — implementação fora do MVP
- **Code signing** — depende de cert disponível

---

## Próximos passos

1. Aprovação deste design pelo usuário
2. Plano de implementação detalhado (`writing-plans` skill) com:
   - Spike de validação do `setSinkId` (gate antes de tudo)
   - Roadmap em fases (M1: setup view + 1 sessão working, M2: bidirecional, M3: polimento UI, M4: release)
   - Definition of done por fase
