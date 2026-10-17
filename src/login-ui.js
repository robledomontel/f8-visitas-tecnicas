import {esc} from './f8-utils.js';

const icon=paths=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
export function loginScreen(message=''){
 return `<main class="login loginPremium">
  <div class="loginBackdrop" aria-hidden="true"><div class="loginRibbon ribbonOne"></div><div class="loginRibbon ribbonTwo"></div><div class="loginRibbon ribbonThree"></div></div>
  <section class="loginCard" aria-labelledby="loginTitle">
   <div class="loginBrand"><img src="/f8-logo-login.svg" alt="F8 Soluções em Tecnologia" width="200" height="120"></div>
   <div class="loginEyebrow"><span></span> ÁREA DA EQUIPE</div>
   <h1 id="loginTitle">Bem-vindo <em>de volta.</em></h1>
   <p class="loginIntro">Acesse o Sistema F8 para continuar.</p>
   <form id="login">
    <label for="loginUser">Usuário</label>
    <div class="loginField">${icon('<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>')}<input id="loginUser" name="user" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="Digite seu usuário"></div>
    <label for="loginPass">Senha</label>
    <div class="loginField">${icon('<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 15v2"/>')}<input id="loginPass" name="pass" type="password" autocomplete="current-password" required placeholder="Digite sua senha"><button type="button" id="togglePassword" aria-label="Mostrar senha" aria-pressed="false">${icon('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>')}</button></div>
    <div class="error" role="alert" aria-live="polite">${esc(message)}</div>
    <button class="loginSubmit" type="submit">Entrar no Sistema F8 <span aria-hidden="true">→</span></button>
   </form>
   <div class="loginFooter">${icon('<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>')}<span>Acesso restrito à equipe F8.</span></div>
  </section>
  <p class="loginSignature">F8 SOLUÇÕES EM TECNOLOGIA</p>
 </main>`;
}
