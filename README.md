# 🏔️ Daniel Alconchel — Portfolio & Blog

Portfolio personal construido con **Astro** + **Tailwind CSS**. Minimalista, bilingüe (ES/EN), con modo claro/oscuro y blog en Markdown con soporte LaTeX.

## 🚀 Despliegue en GitHub Pages

El despliegue es automático. Cada vez que hagas `git push` a `main`, GitHub Actions construye y publica la web.

### Primera vez:

1. Crea un repo en GitHub (por ejemplo `danieeeld2.github.io` o el nombre que quieras)
2. Sube el proyecto:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/danieeeld2/TU-REPO.git
   git push -u origin main
   ```
3. Ve a **Settings → Pages** en tu repo
4. En **Source**, selecciona **GitHub Actions**
5. ¡Listo! Tu web estará en `https://danieeeld2.github.io/` (o el nombre de tu repo)

> Si el repo no se llama `danieeeld2.github.io`, añade `base: '/nombre-repo'` en `astro.config.mjs`.

## 📁 Estructura del proyecto

```
daniel-site/
├── src/
│   ├── data/
│   │   ├── es.json          ← 🇪🇸 Contenido en español (CV, proyectos, textos)
│   │   └── en.json          ← 🇬🇧 Contenido en inglés
│   ├── content/
│   │   └── blog/
│   │       ├── es/           ← 📝 Posts en español (.md)
│   │       └── en/           ← 📝 Posts en inglés (.md)
│   ├── components/           ← Componentes (Nav, Hero, CV, etc.)
│   ├── layouts/              ← Layout principal
│   ├── pages/                ← Rutas
│   └── styles/               ← CSS global
├── public/
│   └── images/               ← Imágenes (Alhambra, perfil)
├── astro.config.mjs          ← Config de Astro
├── tailwind.config.mjs       ← Config de Tailwind
└── .github/workflows/        ← GitHub Actions (deploy automático)
```

## ✏️ Cómo actualizar contenido

### Actualizar CV, proyectos o textos

Edita `src/data/es.json` y/o `src/data/en.json`. Cada JSON tiene secciones claras:

- `hero` → Texto del banner principal
- `about` → Sección "Sobre mí"
- `cv.experience.items` → Experiencia laboral (añade objetos al array)
- `cv.education.items` → Educación
- `cv.skills.categories` → Habilidades
- `cv.awards.items` → Premios
- `projects.items` → Proyectos
- `hobbies.items` → Hobbies
- `contact` → Datos de contacto

Ejemplo — añadir un nuevo trabajo:

```json
{
  "role": "Cloud Engineer",
  "company": "Empresa X",
  "url": "https://empresax.com",
  "period": "Jun 2026 — Presente",
  "current": true,
  "description": [
    "Primera responsabilidad.",
    "Segunda responsabilidad."
  ]
}
```

### Añadir una entrada al blog

1. Crea un archivo `.md` en `src/content/blog/es/` (o `en/`)
2. Añade el frontmatter:

```markdown
---
title: "Título del post"
date: "2026-03-15"
description: "Breve descripción."
tags: ["devops", "docker"]
lang: "es"
---

Tu contenido en Markdown...

Fórmulas inline: $E = mc^2$

Fórmulas en bloque:
$$\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}$$
```

3. `git add . && git commit -m "New post" && git push` → se publica solo.

### Cambiar imágenes

Sustituye los archivos en `public/images/`:
- `profile.jpg` → Tu foto de perfil
- `alhambra.jpg` → Banner de la Alhambra

## 🛠 Desarrollo local

```bash
npm install
npm run dev          # localhost:4321
npm run build        # Build de producción
npm run preview      # Preview del build
```
