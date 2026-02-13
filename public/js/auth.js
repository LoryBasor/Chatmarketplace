// public/js/auth.js - Gestion de l'authentification

const API_URL = window.location.origin + '/api';

// Elements du DOM
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const showRegisterBtn = document.getElementById('showRegister');
const showLoginBtn = document.getElementById('showLogin');
const errorDiv = document.getElementById('authError');

// Basculer entre connexion et inscription
showRegisterBtn.addEventListener('click', (e) => {
  e.preventDefault();
  loginForm.classList.remove('active');
  registerForm.classList.add('active');
  errorDiv.classList.remove('show');
});

showLoginBtn.addEventListener('click', (e) => {
  e.preventDefault();
  registerForm.classList.remove('active');
  loginForm.classList.add('active');
  errorDiv.classList.remove('show');
});

// Afficher une erreur
function showError(message) {
  errorDiv.textContent = message;
  errorDiv.classList.add('show');
  setTimeout(() => {
    errorDiv.classList.remove('show');
  }, 5000);
}

// Connexion
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erreur de connexion');
    }

    // Sauvegarder le token et les infos utilisateur
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));

    // Rediriger vers le chat
    window.location.href = '/chat';

  } catch (error) {
    showError(error.message);
  }
});

// Inscription
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const name = document.getElementById('registerName').value;
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;
  const passwordConfirm = document.getElementById('registerPasswordConfirm').value;

  // Validation
  if (password !== passwordConfirm) {
    showError('Les mots de passe ne correspondent pas');
    return;
  }

  if (password.length < 6) {
    showError('Le mot de passe doit contenir au moins 6 caractères');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, email, password })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Erreur lors de l\'inscription');
    }

    // Sauvegarder le token et les infos utilisateur
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));

    // Rediriger vers le chat
    window.location.href = '/chat';

  } catch (error) {
    showError(error.message);
  }
});

// Vérifier si déjà connecté
if (localStorage.getItem('token')) {
  window.location.href = '/chat';
}