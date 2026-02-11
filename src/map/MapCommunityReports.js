import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import maplibregl from 'maplibre-gl';
import { map } from './core/MapView';
import fetchOrThrow from '../common/util/fetchOrThrow';
import buracoIconUrl from '../resources/images/icon/035_pothole.svg';
import radarIconUrl from '../resources/images/icon/community-radar.png';
import quebraMolasIconUrl from '../resources/images/icon/bump-ahead-sign-icon.svg';

const typeLabelMap = {
  RADAR: 'Radar',
  BURACO: 'Buraco',
  QUEBRA_MOLAS: 'Lombada',
};

const statusLabelMap = {
  PENDING_PRIVATE: 'Aguardando aprovação',
  APPROVED_PUBLIC: 'Público',
  REJECTED: 'Rejeitado',
};

/** Zoom mínimo para começar a desenhar avisos comunitários */
const COMMUNITY_MIN_ZOOM = 17;
const LOMBADA_MAX_VIEW_RADIUS_METERS = 500;
const COMMUNITY_ICON_BASE_SIZE = 64;
const COMMUNITY_POPUP_CLASS = 'community-report-popup';
const COMMUNITY_POPUP_STYLE_ID = 'community-report-popup-style';

const ensureCommunityPopupStyle = () => {
  if (typeof document === 'undefined' || document.getElementById(COMMUNITY_POPUP_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = COMMUNITY_POPUP_STYLE_ID;
  style.textContent = `
    .maplibregl-popup.${COMMUNITY_POPUP_CLASS} .maplibregl-popup-content {
      padding: 0;
      border-radius: 18px;
      background: rgba(250, 251, 255, 0.95);
      border: 1px solid rgba(226, 232, 240, 0.92);
      box-shadow: 0 20px 48px rgba(15, 23, 42, 0.2);
      backdrop-filter: blur(18px) saturate(145%);
      -webkit-backdrop-filter: blur(18px) saturate(145%);
    }

    .maplibregl-popup.${COMMUNITY_POPUP_CLASS} .maplibregl-popup-close-button {
      display: none;
    }

    .maplibregl-popup.${COMMUNITY_POPUP_CLASS}.maplibregl-popup-anchor-top .maplibregl-popup-tip,
    .maplibregl-popup.${COMMUNITY_POPUP_CLASS}.maplibregl-popup-anchor-top-left .maplibregl-popup-tip,
    .maplibregl-popup.${COMMUNITY_POPUP_CLASS}.maplibregl-popup-anchor-top-right .maplibregl-popup-tip {
      border-bottom-color: rgba(250, 251, 255, 0.95);
    }

    .maplibregl-popup.${COMMUNITY_POPUP_CLASS}.maplibregl-popup-anchor-bottom .maplibregl-popup-tip,
    .maplibregl-popup.${COMMUNITY_POPUP_CLASS}.maplibregl-popup-anchor-bottom-left .maplibregl-popup-tip,
    .maplibregl-popup.${COMMUNITY_POPUP_CLASS}.maplibregl-popup-anchor-bottom-right .maplibregl-popup-tip {
      border-top-color: rgba(250, 251, 255, 0.95);
    }

    .maplibregl-popup.${COMMUNITY_POPUP_CLASS}.maplibregl-popup-anchor-left .maplibregl-popup-tip {
      border-right-color: rgba(250, 251, 255, 0.95);
    }

    .maplibregl-popup.${COMMUNITY_POPUP_CLASS}.maplibregl-popup-anchor-right .maplibregl-popup-tip {
      border-left-color: rgba(250, 251, 255, 0.95);
    }
  `;
  document.head.appendChild(style);
};

const formatCreatedAt = (value) => {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString('pt-BR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatAuthorForDisplay = (value) => {
  if (!value) {
    return 'Usuario';
  }
  const raw = String(value).trim();
  if (!raw) {
    return 'Usuario';
  }
  const normalized = raw.includes('@') ? raw.split('@')[0] : raw;
  const parts = normalized.split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return 'Usuario';
  }
  if (parts.length === 1) {
    return parts[0];
  }
  return parts[parts.length - 1];
};
const MapCommunityReports = ({
  publicReports,
  pendingReports,
  onCancelPending,
}) => {
  const id = useId();
  const symbolLayerId = `${id}-community-symbol`;
  const speedBumpLayerId = `${id}-community-symbol-quebra-molas`;
  const popupRef = useRef(null);
  const [voteState, setVoteState] = useState({});
  const [hiddenReports, setHiddenReports] = useState(new Set());

  const clearPopup = useCallback(() => {
    if (popupRef.current) {
      popupRef.current.remove();
      popupRef.current = null;
    }
  }, []);

  const loadVotes = useCallback(async (reportId) => {
    const response = await fetchOrThrow(`/api/community/reports/${reportId}/votes`);
    const data = await response.json();
    setVoteState((prev) => ({ ...prev, [reportId]: data }));
    setHiddenReports((prev) => {
      const next = new Set(prev);
      if (data.status === 'REMOVED') {
        next.add(String(reportId));
      } else {
        next.delete(String(reportId));
      }
      return next;
    });
    if (data.status === 'REMOVED') {
      clearPopup();
    }
    return data;
  }, [clearPopup]);

  const sendVote = useCallback(async (reportId, vote) => {
    const response = await fetchOrThrow(`/api/community/reports/${reportId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vote }),
    });
    const data = await response.json();
    setVoteState((prev) => ({ ...prev, [reportId]: data }));
    setHiddenReports((prev) => {
      const next = new Set(prev);
      if (data.status === 'REMOVED') {
        next.add(String(reportId));
      } else {
        next.delete(String(reportId));
      }
      return next;
    });
    if (data.status === 'REMOVED') {
      clearPopup();
    }
    return data;
  }, [clearPopup]);

  const imageIds = useMemo(() => ({
    BURACO: `${id}-community-icon-buraco`,
    BURACO_APPROVED: `${id}-community-icon-buraco-approved`,
    RADAR: `${id}-community-icon-radar`,
    QUEBRA_MOLAS: `${id}-community-icon-quebra-molas`,
  }), [id]);

  const features = useMemo(() => {
    const all = [
      ...(publicReports || []).map((report) => ({ ...report, pending: false })),
      ...(pendingReports || []).map((report) => ({ ...report, pending: true })),
    ];

    return {
      type: 'FeatureCollection',
      features: all
        .filter((report) => Number.isFinite(report.latitude) && Number.isFinite(report.longitude))
        .map((report) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [report.longitude, report.latitude],
          },
          properties: {
            reportId: report.id,
            type: report.type,
            status: report.status,
            pending: report.pending,
            createdAt: report.createdAt,
            radarSpeedLimit: report.radarSpeedLimit,
            cancelable: Boolean(report.cancelable),
            authorName: report.authorName,
            existsVotes: report.existsVotes ?? 0,
            goneVotes: report.goneVotes ?? 0,
            lastVotedAt: report.lastVotedAt,
          },
        })),
    };
  }, [publicReports, pendingReports]);

  useEffect(() => {
    ensureCommunityPopupStyle();

    const iconEntries = [
      { imageId: imageIds.BURACO, iconUrl: buracoIconUrl },
      { imageId: imageIds.BURACO_APPROVED, iconUrl: buracoIconUrl },
      { imageId: imageIds.RADAR, iconUrl: radarIconUrl },
      { imageId: imageIds.QUEBRA_MOLAS, iconUrl: quebraMolasIconUrl },
    ];

    const loadSvgAsMapImage = (imageId, iconUrl) => {
      if (map.hasImage(imageId)) {
        return;
      }
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        if (!map.hasImage(imageId)) {
          const width = image.naturalWidth || image.width || COMMUNITY_ICON_BASE_SIZE;
          const height = image.naturalHeight || image.height || COMMUNITY_ICON_BASE_SIZE;
          const pixelRatio = Math.max(width, height) / COMMUNITY_ICON_BASE_SIZE;
          map.addImage(imageId, image, {
            pixelRatio: Math.max(pixelRatio, 0.01),
          });
        }
      };
      image.src = iconUrl;
    };

    iconEntries.forEach(({ imageId, iconUrl }) => {
      loadSvgAsMapImage(imageId, iconUrl);
    });

    map.addSource(id, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [],
      },
    });

    map.addLayer({
      id: symbolLayerId,
      type: 'symbol',
      source: id,
      minzoom: COMMUNITY_MIN_ZOOM,
      filter: ['!=', ['get', 'type'], 'QUEBRA_MOLAS'],
      layout: {
        'icon-image': [
          'match',
          ['get', 'type'],
          'BURACO',
          ['case', ['to-boolean', ['get', 'pending']], imageIds.BURACO, imageIds.BURACO_APPROVED],
          'RADAR',
          imageIds.RADAR,
          imageIds.RADAR,
        ],
        // icon-size must have zoom at the top level; apply type scaling per stop
        'icon-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          16,
          ['*', 0.35, ['match', ['get', 'type'], 'BURACO', 0.8, 'RADAR', 1.1, 1.1]],
          17.5,
          ['*', 0.45, ['match', ['get', 'type'], 'BURACO', 0.8, 'RADAR', 1.1, 1.1]],
          19,
          ['*', 0.55, ['match', ['get', 'type'], 'BURACO', 0.8, 'RADAR', 1.1, 1.1]],
        ],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-padding': 8,
      },
      paint: {
        'icon-opacity': ['case', ['to-boolean', ['get', 'pending']], 0.58, 1],
      },
    });

    map.addLayer({
      id: speedBumpLayerId,
      type: 'symbol',
      source: id,
      minzoom: COMMUNITY_MIN_ZOOM,
      filter: ['==', ['get', 'type'], 'QUEBRA_MOLAS'],
      layout: {
        'icon-image': imageIds.QUEBRA_MOLAS,
        'icon-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          16,
          ['*', 0.35, 1.1],
          17.5,
          ['*', 0.45, 1.1],
          19,
          ['*', 0.55, 1.1],
        ],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'icon-padding': 8,
      },
      paint: {
        'icon-opacity': ['case', ['to-boolean', ['get', 'pending']], 0.58, 1],
      },
    });

    const onMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onMouseLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    const onClick = (event) => {
      const feature = event.features?.[0];
      if (!feature?.properties) {
        return;
      }

      const reportId = feature.properties.reportId;
      const type = feature.properties.type;
      const status = feature.properties.status;
      const createdAt = feature.properties.createdAt;
      const radarSpeedLimit = Number(feature.properties.radarSpeedLimit);
      const pending = feature.properties.pending === true || feature.properties.pending === 'true';
      const cancelable = feature.properties.cancelable === true || feature.properties.cancelable === 'true';
      const authorName = formatAuthorForDisplay(feature.properties.authorName);
      const initialVotes = voteState[reportId] || {
        existsVotes: feature.properties.existsVotes || 0,
        goneVotes: feature.properties.goneVotes || 0,
        userVote: feature.properties.userVote,
        lastVotedAt: feature.properties.lastVotedAt,
        status,
        canVote: feature.properties.userVote ? false : true,
        nextVoteAt: null,
      };

      clearPopup();

      const typeThemeMap = {
        BURACO: {
          accent: '#B45309',
          accentSoft: '#FFF7ED',
          border: '#FDBA74',
          closeBg: '#FFEDD5',
        },
        QUEBRA_MOLAS: {
          accent: '#0369A1',
          accentSoft: '#ECFEFF',
          border: '#7DD3FC',
          closeBg: '#E0F2FE',
        },
        RADAR: {
          accent: '#B91C1C',
          accentSoft: '#FEF2F2',
          border: '#FDA4AF',
          closeBg: '#FEE2E2',
        },
      };
      const theme = typeThemeMap[type] || {
        accent: '#334155',
        accentSoft: '#F8FAFC',
        border: '#CBD5E1',
        closeBg: '#F1F5F9',
      };

      const titleMap = {
        BURACO: 'Buraco na pista',
        QUEBRA_MOLAS: 'Lombada na pista',
        RADAR: 'Radar na pista',
      };

      const container = document.createElement('div');
      container.style.minWidth = '260px';
      container.style.maxWidth = '320px';
      container.style.padding = '14px';
      container.style.display = 'flex';
      container.style.flexDirection = 'column';
      container.style.gap = '10px';
      container.style.color = '#0F172A';
      container.style.fontFamily = '"SF Pro Text", "Segoe UI", sans-serif';
      container.addEventListener('click', (event) => event.stopPropagation());
      container.addEventListener('mousedown', (event) => event.stopPropagation());
      container.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true });
      container.addEventListener('touchend', (event) => event.stopPropagation());

      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.alignItems = 'flex-start';
      header.style.justifyContent = 'space-between';
      header.style.gap = '10px';
      container.appendChild(header);

      const headerInfo = document.createElement('div');
      headerInfo.style.display = 'flex';
      headerInfo.style.flexDirection = 'column';
      headerInfo.style.gap = '6px';
      headerInfo.style.flex = '1';
      header.appendChild(headerInfo);

      const chipsRow = document.createElement('div');
      chipsRow.style.display = 'flex';
      chipsRow.style.flexWrap = 'wrap';
      chipsRow.style.gap = '6px';
      headerInfo.appendChild(chipsRow);

      const typeChip = document.createElement('span');
      typeChip.style.display = 'inline-flex';
      typeChip.style.alignItems = 'center';
      typeChip.style.padding = '3px 10px';
      typeChip.style.borderRadius = '999px';
      typeChip.style.fontSize = '11px';
      typeChip.style.fontWeight = '700';
      typeChip.style.letterSpacing = '0.2px';
      typeChip.style.background = theme.accentSoft;
      typeChip.style.border = `1px solid ${theme.border}`;
      typeChip.style.color = theme.accent;
      typeChip.textContent = typeLabelMap[type] || type || '-';
      chipsRow.appendChild(typeChip);

      if (pending) {
        const pendingChip = document.createElement('span');
        pendingChip.style.display = 'inline-flex';
        pendingChip.style.alignItems = 'center';
        pendingChip.style.padding = '3px 10px';
        pendingChip.style.borderRadius = '999px';
        pendingChip.style.fontSize = '11px';
        pendingChip.style.fontWeight = '700';
        pendingChip.style.letterSpacing = '0.2px';
        pendingChip.style.background = '#EEF2FF';
        pendingChip.style.border = '1px solid #C7D2FE';
        pendingChip.style.color = '#4338CA';
        pendingChip.textContent = 'Aguardando aprovacao';
        chipsRow.appendChild(pendingChip);
      }

      const title = document.createElement('div');
      title.style.fontWeight = '700';
      title.style.fontSize = '15px';
      title.style.lineHeight = '1.25';
      title.textContent = titleMap[type] || (typeLabelMap[type] || type || '-');
      headerInfo.appendChild(title);

      const subtitle = document.createElement('div');
      subtitle.style.fontSize = '12px';
      subtitle.style.color = '#475569';
      subtitle.style.lineHeight = '1.3';
      subtitle.textContent = `Reportado por ${authorName}`;
      headerInfo.appendChild(subtitle);

      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.setAttribute('aria-label', 'Fechar');
      closeButton.style.width = '28px';
      closeButton.style.height = '28px';
      closeButton.style.borderRadius = '999px';
      closeButton.style.border = '1px solid #D1D5DB';
      closeButton.style.background = theme.closeBg;
      closeButton.style.color = '#0F172A';
      closeButton.style.display = 'inline-flex';
      closeButton.style.alignItems = 'center';
      closeButton.style.justifyContent = 'center';
      closeButton.style.fontSize = '18px';
      closeButton.style.lineHeight = '1';
      closeButton.style.fontWeight = '500';
      closeButton.style.cursor = 'pointer';
      closeButton.style.flexShrink = '0';
      closeButton.textContent = '\u00D7';
      closeButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        clearPopup();
      });
      closeButton.addEventListener('mousedown', (event) => event.stopPropagation());
      closeButton.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true });
      closeButton.addEventListener('touchend', (event) => event.stopPropagation());
      header.appendChild(closeButton);

      const metaBlock = document.createElement('div');
      metaBlock.style.display = 'flex';
      metaBlock.style.flexDirection = 'column';
      metaBlock.style.gap = '5px';
      metaBlock.style.padding = '10px';
      metaBlock.style.borderRadius = '12px';
      metaBlock.style.background = 'rgba(255, 255, 255, 0.78)';
      metaBlock.style.border = '1px solid rgba(226, 232, 240, 0.9)';
      container.appendChild(metaBlock);

      const statusLine = document.createElement('div');
      statusLine.style.fontSize = '12px';
      statusLine.style.color = '#334155';
      statusLine.textContent = `Status: ${statusLabelMap[status] || status || '-'}`;
      metaBlock.appendChild(statusLine);

      const createdLine = document.createElement('div');
      createdLine.style.fontSize = '12px';
      createdLine.style.color = '#334155';
      createdLine.textContent = `Criado em: ${formatCreatedAt(createdAt)}`;
      metaBlock.appendChild(createdLine);

      if (type === 'RADAR' && Number.isFinite(radarSpeedLimit) && radarSpeedLimit > 0) {
        const speedLine = document.createElement('div');
        speedLine.style.fontSize = '12px';
        speedLine.style.color = '#334155';
        speedLine.textContent = `Velocidade: ${radarSpeedLimit} km/h`;
        metaBlock.appendChild(speedLine);
      }

      const votesBlock = document.createElement('div');
      votesBlock.style.display = 'flex';
      votesBlock.style.flexDirection = 'column';
      votesBlock.style.gap = '6px';
      votesBlock.style.padding = '10px';
      votesBlock.style.borderRadius = '12px';
      votesBlock.style.background = 'rgba(248, 250, 252, 0.9)';
      votesBlock.style.border = '1px solid rgba(203, 213, 225, 0.88)';
      container.appendChild(votesBlock);

      const voteLine = document.createElement('div');
      voteLine.style.fontSize = '13px';
      voteLine.style.fontWeight = '700';
      voteLine.style.color = '#0F172A';
      votesBlock.appendChild(voteLine);

      const lastVoteLine = document.createElement('div');
      lastVoteLine.style.fontSize = '11px';
      lastVoteLine.style.color = '#64748B';
      votesBlock.appendChild(lastVoteLine);

      const feedbackLine = document.createElement('div');
      feedbackLine.style.fontSize = '11px';
      feedbackLine.style.fontWeight = '600';
      feedbackLine.style.minHeight = '14px';
      feedbackLine.style.color = '#B91C1C';
      votesBlock.appendChild(feedbackLine);

      const updateVoteInfo = (data) => {
        const exists = data?.existsVotes ?? 0;
        const gone = data?.goneVotes ?? 0;
        voteLine.textContent = `Votos: Ainda existe ${exists} | Sumiu ${gone}`;
        if (data?.lastVotedAt) {
          lastVoteLine.textContent = `Ultimo voto: ${formatCreatedAt(data.lastVotedAt)}`;
        } else {
          lastVoteLine.textContent = '';
        }
      };
      updateVoteInfo(initialVotes);

      const buttonsRow = document.createElement('div');
      buttonsRow.style.display = 'flex';
      buttonsRow.style.gap = '8px';
      buttonsRow.style.marginTop = '2px';
      buttonsRow.addEventListener('click', (event) => event.stopPropagation());
      buttonsRow.addEventListener('mousedown', (event) => event.stopPropagation());
      buttonsRow.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true });
      buttonsRow.addEventListener('touchend', (event) => event.stopPropagation());
      container.appendChild(buttonsRow);

      const voteButtons = [];
      const setVoteButtonsDisabled = (disabled) => {
        voteButtons.forEach((button) => {
          button.disabled = disabled;
          button.style.opacity = disabled ? '0.65' : '1';
          button.style.cursor = disabled ? 'not-allowed' : 'pointer';
        });
      };

      const renderButton = (label, value) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.style.flex = '1';
        button.style.minHeight = '40px';
        button.style.borderRadius = '11px';
        button.style.border = '1px solid #CBD5E1';
        button.style.background = '#FFFFFF';
        button.style.color = '#0F172A';
        button.style.fontWeight = '700';
        button.style.fontSize = '13px';
        button.style.cursor = 'pointer';
        button.style.touchAction = 'manipulation';
        button.style.transition = 'all 0.18s ease';
        button.textContent = label;
        voteButtons.push(button);

        const applyActive = (active) => {
          if (active && value === 'EXISTS') {
            button.style.background = 'linear-gradient(135deg, #38BDF8 0%, #0284C7 100%)';
            button.style.borderColor = '#0284C7';
            button.style.color = '#FFFFFF';
            button.style.boxShadow = '0 8px 18px rgba(2, 132, 199, 0.28)';
            return;
          }
          if (active && value === 'GONE') {
            button.style.background = 'linear-gradient(135deg, #64748B 0%, #334155 100%)';
            button.style.borderColor = '#334155';
            button.style.color = '#FFFFFF';
            button.style.boxShadow = '0 8px 18px rgba(51, 65, 85, 0.26)';
            return;
          }
          button.style.background = '#FFFFFF';
          button.style.borderColor = '#CBD5E1';
          button.style.color = '#0F172A';
          button.style.boxShadow = 'none';
        };

        applyActive(initialVotes.userVote === value);
        button.onclick = async (event) => {
          event.preventDefault();
          event.stopPropagation();
          setVoteButtonsDisabled(true);
          feedbackLine.textContent = '';
          feedbackLine.style.color = '#475569';
          feedbackLine.textContent = 'Enviando voto...';
          try {
            const data = await sendVote(reportId, value);
            applyUserVote(data);
            updateVoteInfo(data);
            feedbackLine.style.color = '#166534';
            feedbackLine.textContent = 'Voto enviado com sucesso.';
            setVoteButtonsDisabled(!(data?.canVote ?? true));
          } catch (error) {
            console.warn('vote failed', error);
            const message = String(error?.message || '').toUpperCase();
            if (message.includes('VOTE_COOLDOWN_ACTIVE')) {
              const currentData = await loadVotes(reportId).catch(() => null);
              if (currentData?.nextVoteAt) {
                feedbackLine.textContent = `Voce podera votar novamente em ${formatCreatedAt(currentData.nextVoteAt)}.`;
              } else {
                feedbackLine.textContent = 'Voce ja votou neste ponto recentemente.';
              }
              feedbackLine.style.color = '#92400E';
              setVoteButtonsDisabled(true);
            } else {
              feedbackLine.textContent = 'Nao foi possivel votar.';
              feedbackLine.style.color = '#B91C1C';
              setVoteButtonsDisabled(false);
            }
          } finally {
            if (!feedbackLine.textContent) {
              setVoteButtonsDisabled(false);
            }
          }
        };
        button.addEventListener('mousedown', (event) => event.stopPropagation());
        button.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true });
        button.addEventListener('touchend', (event) => event.stopPropagation());
        buttonsRow.appendChild(button);
        return applyActive;
      };

      const applyExistsActive = renderButton('Ainda existe', 'EXISTS');
      const applyGoneActive = renderButton('Sumiu', 'GONE');
      const applyUserVote = (data) => {
        applyExistsActive(data?.userVote === 'EXISTS');
        applyGoneActive(data?.userVote === 'GONE');
      };
      applyUserVote(initialVotes);
      setVoteButtonsDisabled(!(initialVotes?.canVote ?? true));
      if (!(initialVotes?.canVote ?? true) && initialVotes?.nextVoteAt) {
        feedbackLine.style.color = '#92400E';
        feedbackLine.textContent = `Voce podera votar novamente em ${formatCreatedAt(initialVotes.nextVoteAt)}.`;
      }

      if (pending && cancelable && onCancelPending) {
        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.style.minHeight = '40px';
        cancelButton.style.padding = '10px 12px';
        cancelButton.style.border = '1px solid #CBD5E1';
        cancelButton.style.borderRadius = '11px';
        cancelButton.style.background = '#FFFFFF';
        cancelButton.style.color = '#334155';
        cancelButton.style.fontWeight = '700';
        cancelButton.style.cursor = 'pointer';
        cancelButton.style.textAlign = 'center';
        cancelButton.textContent = 'Cancelar envio';
        cancelButton.addEventListener('mousedown', (event) => event.stopPropagation());
        cancelButton.addEventListener('touchstart', (event) => event.stopPropagation(), { passive: true });
        cancelButton.addEventListener('touchend', (event) => event.stopPropagation());
        cancelButton.onclick = async (event) => {
          event.preventDefault();
          event.stopPropagation();
          cancelButton.disabled = true;
          cancelButton.style.opacity = '0.7';
          cancelButton.textContent = 'Cancelando...';
          try {
            await onCancelPending(reportId);
            clearPopup();
          } catch {
            cancelButton.disabled = false;
            cancelButton.style.opacity = '1';
            cancelButton.textContent = 'Cancelar envio';
          }
        };
        container.appendChild(cancelButton);
      }

      popupRef.current = new maplibregl.Popup({
        className: COMMUNITY_POPUP_CLASS,
        closeButton: false,
        closeOnClick: false,
        maxWidth: '340px',
        offset: 14,
      })
        .setLngLat(event.lngLat)
        .setDOMContent(container)
        .addTo(map);

      loadVotes(reportId)
        .then((data) => {
          updateVoteInfo(data);
          applyUserVote(data);
          setVoteButtonsDisabled(!(data?.canVote ?? true));
          if (!(data?.canVote ?? true) && data?.nextVoteAt) {
            feedbackLine.style.color = '#92400E';
            feedbackLine.textContent = `Voce podera votar novamente em ${formatCreatedAt(data.nextVoteAt)}.`;
          }
        })
        .catch((error) => console.warn('loadVotes failed', error));
    };

    const updateSpeedBumpVisibility = () => {
      if (!map.getLayer(speedBumpLayerId)) {
        return;
      }

      const center = map.getCenter();
      const bounds = map.getBounds();
      const northPoint = new maplibregl.LngLat(center.lng, bounds.getNorth());
      const southPoint = new maplibregl.LngLat(center.lng, bounds.getSouth());
      const viewRadiusMeters = Math.max(
        center.distanceTo(northPoint),
        center.distanceTo(southPoint),
      );
      const visibility = viewRadiusMeters <= LOMBADA_MAX_VIEW_RADIUS_METERS ? 'visible' : 'none';
      if (map.getLayoutProperty(speedBumpLayerId, 'visibility') !== visibility) {
        map.setLayoutProperty(speedBumpLayerId, 'visibility', visibility);
      }
    };

    const interactiveLayerIds = [symbolLayerId, speedBumpLayerId];
    interactiveLayerIds.forEach((layerId) => {
      map.on('mouseenter', layerId, onMouseEnter);
      map.on('mouseleave', layerId, onMouseLeave);
      map.on('click', layerId, onClick);
    });
    map.on('moveend', updateSpeedBumpVisibility);
    map.on('zoomend', updateSpeedBumpVisibility);
    updateSpeedBumpVisibility();

    return () => {
      interactiveLayerIds.forEach((layerId) => {
        map.off('mouseenter', layerId, onMouseEnter);
        map.off('mouseleave', layerId, onMouseLeave);
        map.off('click', layerId, onClick);
      });
      map.off('moveend', updateSpeedBumpVisibility);
      map.off('zoomend', updateSpeedBumpVisibility);
      clearPopup();
      if (map.getLayer(speedBumpLayerId)) {
        map.removeLayer(speedBumpLayerId);
      }
      if (map.getLayer(symbolLayerId)) {
        map.removeLayer(symbolLayerId);
      }
      if (map.getSource(id)) {
        map.removeSource(id);
      }
      Object.values(imageIds).forEach((imageId) => {
        if (map.hasImage(imageId)) {
          map.removeImage(imageId);
        }
      });
    };
  }, [id, imageIds, onCancelPending, speedBumpLayerId, symbolLayerId]);

  useEffect(() => {
    const filteredFeatures = {
      ...features,
      features: features.features.filter((feature) => {
        const reportId = feature?.properties?.reportId;
        return !hiddenReports.has(String(reportId));
      }),
    };
    map.getSource(id)?.setData(filteredFeatures);
  }, [features, hiddenReports, id]);

  return null;
};

export default MapCommunityReports;

