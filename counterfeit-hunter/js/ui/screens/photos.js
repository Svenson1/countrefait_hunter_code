import { cameraStatus } from '../../camera.js';
import { CLOSE_UP_VIEWS, VIEWS } from '../../config.js';
import { t } from '../../i18n/index.js';
import { icons } from '../../icons.js';
import { viewIllustration } from '../../images.js';
import { countPhotosTaken } from '../../inspection.js';
import { state } from '../../state.js';
import { each, escapeHtml } from '../dom.js';

/*
 * Step 1, the camera. It opens straight from "Check a banknote", says which of
 * the six photos to take next, and moves on to the next one after each photo.
 * The row of six slots shows what is done; tapping a slot retakes that photo.
 *
 * Without the live camera (see camera.js) the viewfinder shows a drawing of
 * the photo to take, and the round button opens the phone's camera app.
 */
export function photos() {
  const inspection = state.inspection;
  const view = inspection.currentView;
  const taken = countPhotosTaken(inspection);
  const status = cameraStatus();
  const unavailable = status === 'unavailable';

  return `
    <header class="bar cam-bar">
      <div class="bar-in gut">
        <button class="icon-btn" data-act="leave" aria-label="${t('close')}">${icons.close}</button>
        <div class="bar-t">
          <h1>${t('ph_title')}</h1>
          <p class="sub">${t('step_n', { n: 1 })} · ${t('ph_count', { a: taken, n: VIEWS.length })}</p>
        </div>
        <button class="icon-btn" data-act="tips" aria-label="${t('tips_btn')}">${icons.help}</button>
      </div>
    </header>

    <main class="cam-screen">
      <div class="cam-view">
        ${unavailable ? `<img class="cam-illus" src="${viewIllustration(null, view ?? 'front')}" alt="">` : '<video id="camera-video" playsinline muted></video>'}
        ${view ? `<div class="camera-guide ${guideShape(view)}" aria-hidden="true"></div>` : ''}
        <div class="cam-instruction">${instruction(view)}</div>
        ${view ? statusMessage(status) : ''}
      </div>

      ${unavailable || !view
        ? `<p class="cam-after">${view ? t('cam_after') : ''}</p>`
        : '<div class="camera-checks" id="camera-checks" aria-live="polite"></div>'}

      <ol class="cam-slots">${each(VIEWS, (slotView, i) => slot(slotView, i, inspection.photos[slotView], view))}</ol>

      <div class="cam-controls">
        <button class="cam-side" data-act="choose-photo" aria-label="${t('ph_choose')}"${view ? '' : ' disabled'}>
          ${icons.image}<span>${t('ph_gallery')}</span>
        </button>
        <button class="shutter" data-act="shutter" aria-label="${t('ph_take')}"${view && status !== 'starting' && status !== 'off' ? '' : ' disabled'}></button>
        ${taken === VIEWS.length
          ? `<button class="cam-next" data-act="photos-done">${t('ph_next')}${icons.chevron}</button>`
          : `<button class="cam-side" data-act="sample-photos" aria-label="${t('ph_sample')}">${icons.scan}<span>${t('ph_demo')}</span></button>`}
      </div>
    </main>
  `;
}

function instruction(view) {
  if (!view) return `<span>${t('ph_all_done')}</span>`;
  const number = VIEWS.indexOf(view) + 1;
  return `
    <strong>${t('ph_step', { i: number, n: VIEWS.length })} · ${t(`v_${view}`)}</strong>
    <span>${t(`tip_${view}`)}</span>
  `;
}

function statusMessage(status) {
  if (status === 'unavailable') return `<p class="cam-message">${t('cam_unavailable')}</p>`;
  if (status === 'starting' || status === 'off') return `<p class="cam-message">${t('cam_starting')}</p>`;
  return '';
}

// Front and back fill a banknote-shaped frame; an edge lines up with a single guide line.
function guideShape(view) {
  if (CLOSE_UP_VIEWS.includes(view)) return 'flat';
  return view === 'left' || view === 'right' ? 'edge-v' : 'edge-h';
}

function slot(view, index, photo, currentView) {
  const classes = ['slot'];
  if (view === currentView) classes.push('current');
  if (photo) classes.push(photo.quality === 'ok' ? 'done' : 'warn');

  const name = t(`v_${view}`);
  const label = photo ? `${t('ph_retake')}: ${name}` : name;

  return `
    <li>
      <button class="${classes.join(' ')}" data-act="select-view" data-view="${view}"
        aria-label="${escapeHtml(label)}"${view === currentView ? ' aria-current="step"' : ''}>
        ${photo ? `<img src="${photo.thumb}" alt="">` : `<span>${index + 1}</span>`}
        ${photo ? `<i class="badge">${photo.quality === 'ok' ? icons.check : icons.warning}</i>` : ''}
      </button>
      <span class="slot-label">${t(`vs_${view}`)}</span>
    </li>
  `;
}
