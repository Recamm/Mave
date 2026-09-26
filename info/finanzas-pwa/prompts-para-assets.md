# Prompts para identidad y assets

**Contexto de producto**: [informe-producto.md](informe-producto.md)  
**Dirección de marca**: símbolo de M mayúscula, suave y cálida. Logo de referencia: [SVG](assets/brand/logo.svg) y [PNG](assets/brand/logo.png). Paleta indicada: `#3B1A68`, `#422379` y `#AB87F8`. La validación final de marca sigue pendiente.

## Qué assets hacen falta

Para una app financiera utilitaria, los assets iniciales necesarios son un símbolo de marca y el icono instalable. La marca gráfica será únicamente una M mayúscula; el icono reutilizará esa misma letra. Si se usa el wordmark Mave, se compondrá por separado con tipografía real. No hace falta una ilustración decorativa para el dashboard. Los iconos de acciones y categorías pueden venir de una librería consistente como Lucide y acompañarse con texto cuando el significado no sea obvio.

Generar primero conceptos; revisar originalidad, legibilidad y contraste; luego redibujar el seleccionado como vector real. No usar la imagen generada como logo final sin validarla en tamaños pequeños y en fondos claro y oscuro. Los nombres de marca renderizados por modelos de imagen suelen salir mal: agregar el wordmark con tipografía real después.

## 1. Exploración de símbolo de marca

Usar con ChatGPT Images para generar conceptos iniciales. Si la herramienta permite variaciones, pedir cuatro opciones en una misma lámina 2x2, sin texto ni etiquetas.

> Actúa como director de identidad visual para Mave, una aplicación de finanzas personales. Diseña cuatro conceptos originales de símbolo, separados con claridad en una lámina 2x2 para poder comparar y recortar cada opción. La app ayuda a registrar gastos manualmente, ordenar el dinero y avanzar hacia metas de ahorro; no es un banco, una billetera de pagos ni una app de inversiones.
>
> Busca una identidad serena, confiable, clara y contemporánea. Construye cada concepto únicamente con una M mayúscula diseñada como símbolo, sin acompañarla de otras formas o elementos. La M debe reconocerse a 24 px. Explora trazos curvos, terminales suavizados y proporciones equilibradas para darle una sensación cálida y cercana sin perder claridad ni solidez; puedes usar espacio negativo dentro de la propia letra. Diferencia las cuatro opciones mediante variaciones sutiles de dibujo, no agregando adornos.
>
> Dirección cromática: usa como paleta principal los tres colores exactos del logo: `#3B1A68`, `#422379` y `#AB87F8`. No agregues menta ni colores adicionales al símbolo a color. Conserva la posibilidad de crear variantes monocromáticas para fondos claro y oscuro, usando una tinta oscura y una tinta clara de alto contraste, respectivamente. Usa formas sólidas.
>
> La única letra permitida es la M mayúscula que forma el símbolo. No incluyas wordmark, texto adicional, otras letras, números, símbolos de moneda, gráficos, flechas de crecimiento, alcancías, monedas apiladas, billetes, edificios bancarios, tarjetas ni mockups de teléfono. No uses degradados, brillos, sombras, textura, 3D ni detalles finos. No imites marcas, logos, iconos o paletas reconocibles de Brubank, Naranja X u otra empresa. Fondo neutro uniforme, sin presentación publicitaria.

## 2. Refinar el concepto elegido

Adjuntar la opción seleccionada y usarla como referencia visual. Este prompt pide el símbolo, no el nombre escrito.

> Refina la M mayúscula adjunta para la identidad de Mave. Conserva la idea reconocible y mejora proporción, equilibrio, espacio negativo y legibilidad a 24 px. Su dibujo debe sentirse suave y cálido, propio de una herramienta de finanzas personales: ordenada y confiable, no bancaria, no orientada a pagos y no a inversiones.
>
> Entrega únicamente la M mayúscula centrada, dibujada como símbolo gráfico y no como texto tipográfico; sin wordmark, otras letras, números, slogan, marco ni mockup. Genera una versión a color sobre fondo transparente usando exactamente `#3B1A68`, `#422379` y `#AB87F8`; evita bordes finos, degradados, brillos, sombras y textura. Deja espacio libre alrededor y asegúrate de que la silueta sea legible tanto en tamaño pequeño como grande. No agregues elementos nuevos que no estén en el concepto elegido.

Después, pedir por separado una variante monocromática clara para el tema oscuro y otra oscura para el tema claro. No combinar ambas variantes en una sola lámina para evitar exportar accidentalmente un mockup.

## 3. Icono instalable de la PWA

Adjuntar el símbolo aprobado y generar una imagen por variante. La máscara redondeada la aplica el sistema operativo, no debe dibujarse dentro de la imagen.

> Usando la M adjunta como referencia exacta, crea un icono de aplicación web instalable en un lienzo cuadrado de 1024 x 1024 px. Variante: [OSCURA: fondo `#3B1A68` y M monocromática clara / CLARA: fondo blanco frío y M monocromática `#3B1A68`]. Mantén la geometría de la M; usa estas variantes monocromáticas para conservar el contraste. La M debe ser el único elemento de marca y mantenerse centrada dentro del 80% central del lienzo para que no se recorte con máscaras circulares o redondeadas. Usa una silueta simple y de alto contraste. No agregues texto, otras letras, números, marco, esquinas redondeadas dibujadas, brillo, degradado o sombra. Entrega solo el icono final, sin teléfono ni mockup.

Del master aprobado, el proyecto deberá exportar los tamaños requeridos por el manifest y Apple (`192x192`, `512x512` y `180x180` como punto de partida), más favicon si hace falta. Revisar recortes en iPhone y escritorio antes de publicarlo.

## 4. Alternativa para obtener un SVG limpio

Usar en ChatGPT con la imagen final adjunta. Ejecutar una vez por variante de color. El resultado necesita revisión visual y validación antes de incorporarlo.

> Reconstruye la M mayúscula de referencia como un SVG vectorial limpio y autocontenido. Devuelve únicamente el código SVG completo, sin explicación ni markdown. Usa `viewBox="0 0 512 512"`, fondo transparente, elementos centrados dentro de un área segura de 416 x 416, máximo tres formas geométricas y rellenos sólidos. La M debe dibujarse como vector, no con texto ni fuentes; no agregues otras letras. No uses filtros, máscaras complejas, imágenes incrustadas, fuentes externas, scripts, degradados ni dependencias. Mantén la forma y proporciones de la referencia. Esta alternativa es para una variante monocromática: usa un único color de relleno [COLOR HEX], elegido de la paleta o un tono claro de alto contraste para fondos oscuros. El SVG debe abrirse correctamente en navegadores modernos; no incluyas metadatos de una marca existente.

## 5. Revisión antes de adoptar

- Confirmar que el concepto es original y no se confunde con una marca financiera existente.
- Verificar legibilidad a 16, 24, 32 y 48 px, y sobre los fondos claro y oscuro.
- Comprobar el safe area del icono y que no lleve bordes redondeados dibujados.
- Revisar el SVG con un visualizador y quitar metadata o código innecesario antes de integrarlo.
- Mantener el símbolo como una M sola; si se incorpora el wordmark Mave, componerlo por separado con tipografía real y no depender de texto generado dentro de una imagen.
