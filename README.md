# Yanki Tellez · yankitellez.com

Web estática (HTML + CSS + JS, sin build). Se publica con GitHub Pages; el dominio está en `CNAME`.

## Estructura

```
index.html          Contenido de toda la página (textos, enlaces, precios)
css/styles.css      Estilos: colores y tipografías están en las variables de :root
js/main.js          Animaciones, tema claro/oscuro, menú móvil
js/vendor/          GSAP, ScrollTrigger y Lenis (autoalojados, no hace falta internet)
fonts/              Archivo (titulares), Geist (texto) y Geist Mono (etiquetas)
img/                Capturas de las demos en WebP
og-image.jpg        Imagen que se ve al compartir el enlace (1200x630)
404.html            Página de "no encontrada"
```

## Cambios habituales

- **Textos y precios:** edita `index.html`. Los precios están en la sección `#paquetes`
  (el número que se anima lleva `data-count`: cámbialo también ahí).
- **Enlaces de pago, WhatsApp y Calendly:** busca `paypal.me`, `wa.me` y `calendly.com` en `index.html`.
- **Color de acento:** `--accent` y `--accent-ink` en `css/styles.css`.
- **Nueva demo:** copia un bloque `<article class="demo">` dentro de `#demos` y añade su imagen en `img/`
  (conviértela a WebP; las actuales pesan 25-100 KB). Las portadas actuales son capturas reales de cada
  proyecto montadas en marcos de ordenador y móvil: `sabor-fusion`, `repite` y `albavelle`.

## Probar en local

```
npx serve .
```

Notas: respeta `prefers-reduced-motion` (sin animaciones ni scroll suave) y funciona sin JavaScript
(todo el contenido queda visible).
