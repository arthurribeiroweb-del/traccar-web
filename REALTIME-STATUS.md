# Realtime Status - Diagnóstico e Implementação

## CAUSA RAIZ ENCONTRADA

**Origem do atraso: SERVER→UI** (não DEVICE→SERVER)

- As posições chegam ao servidor e ficam gravadas (replay correto).
- O atraso ocorre porque:
  1. **Reconexão muito lenta**: Em `onclose`, o WebSocket só tentava reconectar após **60 segundos** fixos.
  2. **Sem fallback polling**: Quando o WS caía, não havia polling temporário — a UI ficava parada até reconectar.
  3. **Sem backoff**: Reconexão em tempo fixo, sem backoff exponencial.
  4. **Throttle**: O `throttleMiddleware` pode agregar updates (min 1,5s), mas não é a causa principal — o problema era a reconexão e a falta de fallback.

## O QUE FOI IMPLEMENTADO

### 1. Resiliência WebSocket (`SocketController.jsx`)
- **Backoff exponencial**: 1s → 2s → 5s → 10s → 20s → 60s (máx.)
- **Reconexão em visibilitychange**: Ao voltar do background (WebView), reconecta imediatamente.
- **Reconexão em `online`**: Ao recuperar internet (Wi‑Fi↔4G), reconecta.
- **Poll-once após reconectar**: Após abrir o socket, faz 1 requisição REST (`/api/devices`, `/api/positions`) para sincronizar.
- **Fallback polling**: Se o WebSocket fechar, inicia polling a cada 5s em `/api/devices` e `/api/positions` até o WS voltar.
- **Evento customizado** `traccar-reconnect`: Botão "Reconectar" dispara este evento para forçar reconexão.

### 2. Chip de status + staleness (`RealtimeStatusChip.jsx`)
- **Estados**: CONECTANDO, AO VIVO (≤15s), ATRASADO (15–120s), OFFLINE (>120s), RECONECTANDO, ERRO.
- **Texto**: "Atualizado há {Xs} • HH:MM:SS".
- **Cores**: verde (live), azul (connecting/reconnecting), amarelo (delayed), vermelho (offline/error).

### 3. Ações visíveis em ATRASADO/ERRO
- Botão **Reconectar**: dispara evento e força nova conexão WebSocket.
- Botão **Atualizar agora**: faz poll REST imediato (devices + positions).

### 4. Integração na UI
- **StatusCard** (painel expandido do veículo): chip + staleness + botões.
- **BottomPeekCard** (card compacto no mapa): chip compacto (sem botões).

### 5. Session store
- Novo estado `socketStatus` para o status da conexão em tempo real.

### 6. Geocode
- O `AddressValue` já é assíncrono e não bloqueia atualização do mapa. O mapa usa `session.positions` diretamente do Redux.

## TESTES (PASSO A PASSO)

### Em movimento (dirigindo)
1. Abra o app e selecione um veículo.
2. Verifique se "Atualizado há Xs" se mantém ≤ 10–15s em rede boa.
3. O chip deve ficar verde "Ao vivo".

### WebView em background
1. Coloque o app em background (troque de app ou minimize).
2. Espere alguns segundos.
3. Volte ao app.
4. Deve aparecer "Reconectando…" e recuperar em poucos segundos.

### Troca de rede (Wi‑Fi ↔ 4G)
1. Com o app aberto, desligue Wi‑Fi e use 4G (ou vice-versa).
2. O app deve reconectar automaticamente e exibir "Reconectando…" durante a troca.

### WebSocket caindo
1. No DevTools (Chrome): Network → WS → clique no socket → "Close".
2. O app deve entrar em polling (chip "Atrasado" ou "Offline") e exibir os botões Reconectar e Atualizar agora.
3. Clique em "Reconectar" para tentar novo WebSocket.

### Logs / Network
- **WebSocket**: Abra DevTools → Network → filtro "WS" para ver `/api/socket`.
- **Polling**: Se o WS estiver fechado, verá requisições a `/api/devices` e `/api/positions` a cada 5s.
- **Console**: Em desenvolvimento, o `throttleMiddleware` loga quando entra em throttling.

## ARQUIVOS ALTERADOS/CRIADOS

- `src/SocketController.jsx` — Resiliência WebSocket, backoff, fallback polling.
- `src/store/session.js` — Novo reducer `updateSocketStatus`.
- `src/common/util/realtimeApi.js` — `pollPositionsOnce`, `requestReconnect`.
- `src/common/components/RealtimeStatusChip.jsx` — Chip de status e staleness.
- `src/common/components/StatusCard.jsx` — Integração do chip.
- `src/main/BottomPeekCard.jsx` — Integração do chip (modo compacto).
- `src/resources/l10n/pt_BR.json`, `en.json`, `pt.json` — Strings de realtime.
