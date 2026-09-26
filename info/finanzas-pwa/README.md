# Insumos para empezar con Spec Kit

Esta carpeta contiene documentos de entrada, no artefactos generados por Spec Kit. No se ejecutaron `/speckit-constitution` ni `/speckit-specify`; esos comandos los ejecutás vos.

## Orden de uso

1. Abrí [constitution-input.md](constitution-input.md). En Copilot Chat, ejecutá `/speckit-constitution` y adjuntá el archivo o pegá su contenido como argumento. Revisá la propuesta y confirmá la fecha de ratificación cuando te la pregunte.
2. Cuando la constitución esté aprobada, abrí [specify-input.md](specify-input.md). Ejecutá `/speckit-specify` usando ese documento como descripción completa de la feature. Podés adjuntarlo como contexto; si el comando no toma el archivo adjunto como argumento, pegá su contenido después del comando.
3. Revisá la spec y el checklist que Spec Kit genere en `specs/NNN-finanzas-pwa/`. El número y `.specify/feature.json` los debe crear el comando, no estos insumos.
4. Usá [informe-producto.md](informe-producto.md) como contexto de producto y hosting para `/speckit-clarify` y `/speckit-plan`. El informe contiene decisiones técnicas que conviene mantener fuera de la spec de producto hasta la fase de planificación.
5. Los prompts de [prompts-para-assets.md](prompts-para-assets.md) son para ChatGPT Images/ChatGPT cuando decidas trabajar la identidad visual.

## Qué archivo seleccionar

- Para `/speckit-constitution`: `constitution-input.md`.
- Para `/speckit-specify`: `specify-input.md`.
- Para comparar hosting y preparar el plan: `informe-producto.md`.
- Para generar el logo y el icono: `prompts-para-assets.md`.

No selecciones el informe entero como argumento de `/speckit-specify`: mezcla decisiones técnicas y de hosting que pertenecen al plan, no a la especificación de necesidades del usuario.
