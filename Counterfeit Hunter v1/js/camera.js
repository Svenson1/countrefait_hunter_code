import { CLOSE_UP_VIEWS } from './config.js';
import { t } from './i18n/index.js';
import { icons } from './icons.js';
import { checkPhoto, readPhoto } from './images.js';
import { state } from './state.js';

/*
 * The back camera, shown full screen on the photo step. Light and distance are
 * checked on the viewfinder a few times a second.
 *
 * Browsers only allow this on https or localhost, and the Claude viewer blocks
 * it completely. Where it isn't available the status becomes 'unavailable' and
 * the photo screen uses the phone's camera app instead, checking each photo
 * after it is taken.
 *
 * status: 'off' | 'starting' | 'live' | 'unavailable'
 */

const CHECK_INTERVAL_MS = 300;

let status = 'off';
let stream = null;
let checkTimer = null;
let startId = 0;
let onChange = () => {};

export function cameraStatus() {
  return status;
}

// main.js passes render() here, so the screen redraws when the camera starts or fails.
export function onCameraChange(callback) {
  onChange = callback;
}

export function liveCameraSupported() {
  if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) return false;
  // Chrome says up front when the page is not allowed to use the camera.
  const policy = document.permissionsPolicy || document.featurePolicy;
  if (policy?.allowsFeature && !policy.allowsFeature('camera')) return false;
  return true;
}

// Called after every render: runs the camera on the photo screen and stops it everywhere else.
export function syncCamera(wanted) {
  if (!wanted) {
    if (status !== 'off') stopCamera();
    return;
  }
  if (status === 'off') startCamera();
  else if (status === 'live') attachToVideo();
}

async function startCamera() {
  const id = ++startId;

  if (!liveCameraSupported()) {
    setStatus('unavailable');
    return;
  }

  status = 'starting';
  let newStream;
  try {
    newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
  } catch {
    if (id === startId) setStatus('unavailable');
    return;
  }

  // The user left the photo screen (or it restarted) while the browser was asking for permission.
  if (id !== startId || status !== 'starting') {
    newStream.getTracks().forEach((track) => track.stop());
    return;
  }

  stream = newStream;
  setStatus('live');
}

function stopCamera() {
  startId++;
  clearInterval(checkTimer);
  checkTimer = null;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  status = 'off';
}

function setStatus(newStatus) {
  status = newStatus;
  queueMicrotask(onChange);
}

// The screen is redrawn often, which replaces the <video> element, so the
// stream is attached again after each render.
function attachToVideo() {
  const video = document.getElementById('camera-video');
  if (!video || !stream) return;
  if (video.srcObject !== stream) {
    video.srcObject = stream;
    video.play().catch(() => {});
  }
  if (!checkTimer) {
    checkTimer = setInterval(updateLiveChecks, CHECK_INTERVAL_MS);
  }
}

function updateLiveChecks() {
  const video = document.getElementById('camera-video');
  const box = document.getElementById('camera-checks');
  const view = state.inspection?.currentView;
  if (!video || !box || !view || video.readyState < 2 || !video.videoWidth) return;
  box.innerHTML = liveCheckChips(checkPhoto(video, view), view);
}

export function liveCheckChips({ light, distance }, view) {
  const chip = (ok, label, value) =>
    `<span class="cam-chip ${ok ? 'ok' : 'warn'}">${ok ? icons.check : icons.warning}${label}: ${value}</span>`;

  const lightChip = chip(light === 'ok', t('cam_light'), light === 'ok' ? t('cam_ok') : t(`q_${light}`));
  let distanceChip = `<span class="cam-chip">${t('cam_distance')}: ${t('cam_edge')}</span>`;
  if (CLOSE_UP_VIEWS.includes(view)) {
    distanceChip = chip(distance === 'ok', t('cam_distance'), distance === 'ok' ? t('cam_ok') : t('cam_far'));
  }
  return lightChip + distanceChip;
}

// Take the current frame at full resolution and turn it into a photo.
export async function captureFrame(view) {
  const video = document.getElementById('camera-video');
  if (!video?.videoWidth) throw new Error('Camera not ready');

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  return readPhoto(canvas.toDataURL('image/jpeg', 0.9), view);
}
