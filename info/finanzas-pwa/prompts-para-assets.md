# Prompts para identidad y assets

**Contexto de producto**: [informe-producto.md](informe-producto.md)  
**Estado de marca**: el nombre del producto es Mave. El logo y la identidad visual final están pendientes.

## Qué assets hacen falta

Para una app financiera utilitaria, los assets iniciales necesarios son un símbolo de marca y el icono instalable. No hace falta una ilustración decorativa para el dashboard. Los iconos de acciones y categorías pueden venir de una librería consistente como Lucide y acompañarse con texto cuando el significado no sea obvio.

Generar primero conceptos; revisar originalidad, legibilidad y contraste; luego redibujar el seleccionado como vector real. No usar la imagen generada como logo final sin validarla en tamaños pequeños y en fondos claro y oscuro. Los nombres de marca renderizados por modelos de imagen suelen salir mal: agregar el wordmark con tipografía real después.

## 1. Exploración de símbolo de marca

Usar con ChatGPT Images para generar conceptos iniciales. Si la herramienta permite variaciones, pedir cuatro opciones en una misma lámina 2x2, sin texto ni etiquetas.

> Actúa como director de identidad visual para Mave, una aplicación de finanzas personales. Diseña cuatro conceptos originales de símbolo, separados con claridad en una lámina 2x2 para poder comparar y recortar cada opción. La app ayuda a registrar gastos manualmente, ordenar el dinero y avanzar hacia metas de ahorro; no es un banco, una billetera de pagos ni una app de inversiones.
>
> Busca una identidad serena, confiable, clara y contemporánea. Explora geometrías simples y memorables inspiradas de forma abstracta en orden, registro y una reserva protegida; puedes usar espacio negativo. Que el símbolo siga reconociéndose a 24 px y funcione sin letras.
>
> Dirección cromática: ciruela/tinta violeta profunda, violeta más luminoso y lavanda; un acento menta es opcional. El símbolo debe poder adaptarse también a una tinta clara para fondos oscuros y a una tinta oscura para fondos claros. Usa formas sólidas y pocos colores planos.
>
> No incluyas texto, letras, números, símbolos de moneda, gráficos, flechas de crecimiento, alcancías, monedas apiladas, billetes, edificios bancarios, tarjetas ni mockups de teléfono. No uses degradados, brillos, sombras, textura, 3D ni detalles finos. No imites marcas, logos, iconos o paletas reconocibles de Brubank, Naranja X u otra empresa. Fondo neutro uniforme, sin presentación publicitaria.

## 2. Refinar el concepto elegido

Adjuntar la opción seleccionada y usarla como referencia visual. Este prompt pide el símbolo, no el nombre escrito.

> Refina el símbolo adjunto para la identidad de Mave. Conserva la idea reconocible y mejora proporción, equilibrio, espacio negativo y legibilidad a 24 px. Debe sentirse propio de una herramienta de finanzas personales: ordenada y confiable, no bancaria, no orientada a pagos y no a inversiones.
>
> Entrega únicamente el símbolo centrado, sin wordmark, letras, números, slogan, marco ni mockup. Genera una versión sobre fondo transparente con el símbolo en violeta oscuro y lavanda; evita bordes finos, degradados, brillos, sombras y textura. Deja espacio libre alrededor y asegúrate de que la silueta sea legible tanto en tamaño pequeño como grande. No agregues elementos nuevos que no estén en el concepto elegido.

Después, pedir por separado una variante monocromática clara para el tema oscuro y otra oscura para el tema claro. No combinar ambas variantes en una sola lámina para evitar exportar accidentalmente un mockup.

## 3. Icono instalable de la PWA

Adjuntar el símbolo aprobado y generar una imagen por variante. La máscara redondeada la aplica el sistema operativo, no debe dibujarse dentro de la imagen.

> Usando el símbolo adjunto como referencia exacta, crea un icono de aplicación web instalable en un lienzo cuadrado de 1024 x 1024 px. Variante: [OSCURA: fondo ciruela/tinta violeta y símbolo claro / CLARA: fondo blanco frío y símbolo violeta oscuro]. Mantén el símbolo centrado dentro del 80% central del lienzo para que no se recorte con máscaras circulares o redondeadas. Usa una silueta simple, alto contraste y pocos colores planos. No cambies el diseño del símbolo ni agregues texto, iniciales, números, marco, esquinas redondeadas dibujadas, brillo, degradado o sombra. Entrega solo el icono final, sin teléfono ni mockup.

Del master aprobado, el proyecto deberá exportar los tamaños requeridos por el manifest y Apple (`192x192`, `512x512` y `180x180` como punto de partida), más favicon si hace falta. Revisar recortes en iPhone y escritorio antes de publicarlo.

## 4. Alternativa para obtener un SVG limpio

Usar en ChatGPT con la imagen final adjunta. Ejecutar una vez por variante de color. El resultado necesita revisión visual y validación antes de incorporarlo.

> Reconstruye el símbolo de referencia como un SVG vectorial limpio y autocontenido. Devuelve únicamente el código SVG completo, sin explicación ni markdown. Usa `viewBox="0 0 512 512"`, fondo transparente, elementos centrados dentro de un área segura de 416 x 416, máximo tres formas geométricas, rellenos sólidos y sin texto. No uses filtros, máscaras complejas, imágenes incrustadas, fuentes externas, scripts, degradados ni dependencias. Mantén la forma y proporciones de la referencia. Usa como único color de relleno [COLOR HEX]. El SVG debe abrirse correctamente en navegadores modernos; no incluyas metadatos de una marca existente.

## 5. Revisión antes de adoptar

- Confirmar que el concepto es original y no se confunde con una marca financiera existente.
- Verificar legibilidad a 16, 24, 32 y 48 px, y sobre los fondos claro y oscuro.
- Comprobar el safe area del icono y que no lleve bordes redondeados dibujados.
- Revisar el SVG con un visualizador y quitar metadata o código innecesario antes de integrarlo.
- Incorporar el wordmark después de elegir nombre y tipografía; no depender de letras generadas dentro de una imagen.
