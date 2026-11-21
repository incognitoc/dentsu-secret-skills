(() => {
  const player = document.querySelector('#bgmusic');
  const toggle = document.querySelector('#audio-toggle');
  const panel = document.querySelector('#audio-panel');
  const slider = document.querySelector('#volume-slider');
  const mute = document.querySelector('#audio-mute');
  const status = document.querySelector('#audio-status');
  let level = Number(slider.value);
  let muted = false;
  let lastLevel = level;
  let context, gain;

  function update() {
    const volume = muted ? 0 : level / 100;
    player.muted = volume === 0;
    if (gain) gain.gain.value = volume;
    else player.volume = volume;
    slider.value = muted ? 0 : level;
    document.querySelector('#level').textContent = slider.value + '%';
    mute.textContent = volume === 0 ? '解除靜音' : '靜音';
    toggle.classList.toggle('audio-off', volume === 0 || player.paused);
  }
  function start(interaction) {
    if (muted || !level) return;
    // Some mobile browsers only allow volume changes through a Web Audio gain node.
    if (interaction && !context && Math.abs(player.volume-level/100)>.01 && location.protocol!=='file:') {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (Audio) {
        context = new Audio();
        gain = context.createGain();
        context.createMediaElementSource(player).connect(gain);
        gain.connect(context.destination);
        player.volume = 1;
        update();
      }
    }
    if (context?.state === 'suspended') context.resume().catch(()=>{});
    if (player.paused) player.play().then(()=>{
      status.textContent = '';
      update();
    }).catch(error=>{
      status.textContent = error.name === 'NotAllowedError' ? '點一下頁面以播放音樂' : '音樂暫時無法播放';
      update();
    });
  }
  function close() { panel.hidden=true; toggle.setAttribute('aria-expanded','false'); }
  toggle.onclick = () => {
    panel.hidden=!panel.hidden;
    toggle.setAttribute('aria-expanded',String(!panel.hidden));
    start(true);
  };
  slider.oninput = () => {
    level=Number(slider.value); muted=false;
    if(level)lastLevel=level;
    update();start(true);
  };
  mute.onclick = () => {
    if (muted || !level) { muted=false; level=level || lastLevel; }
    else muted=true;
    update();start(true);
  };
  document.addEventListener('click', e=>{
    if (!panel.hidden && !e.target.closest('.audio-controls')) close();
    if (e.isTrusted) start(true);
  });
  document.addEventListener('keydown', e=>{
    if(e.key==='Escape' && !panel.hidden){close();toggle.focus();}
  });
  player.addEventListener('play',update);
  player.addEventListener('pause',update);
  update();start(false);
})();
