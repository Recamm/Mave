# Brand Assets Checklist: Mave

**Purpose**: revisar si los requisitos de identidad visual y assets permiten explorar, seleccionar, preparar y especificar su uso sin ambigüedades.
**Created**: 2026-09-26
**Feature**: [spec.md](../spec.md) y [brief de identidad y assets](../../../info/finanzas-pwa/prompts-para-assets.md)

**Note**: esta checklist revisa la calidad de los requisitos, no la ejecución ni el resultado de la implementación.
**Review Ownership**: este es un artefacto de revisión de requisitos propiedad de quien revisa. Marcar `[x]` solo cuando la persona revisora determine que el criterio de calidad del requisito está satisfecho.
**Marker Semantics**: `[x]` significa que se revisó y satisfizo el criterio de calidad del requisito; no significa que se haya completado trabajo de implementación.

## Requirement Completeness

- [ ] CHK001 - ¿El brief delimita qué entregables forman la identidad inicial (símbolo, wordmark, variantes e icono instalable) y cuáles se posponen o excluyen, como ilustraciones decorativas e iconos de acciones? [Completeness, Brief §Qué assets hacen falta]
- [ ] CHK002 - ¿La secuencia de entregables está completa y ordenada desde conceptos comparables hasta refinamiento, variantes, master vectorial, exportaciones y wordmark? [Completeness, Brief §§1–5]
- [ ] CHK003 - ¿El alcance ampliado aclara si el wordmark, la tipografía y sus contextos de uso pertenecen a esta identidad o quedan explícitamente para una etapa posterior? [Gap, Ambiguity, Brief §§2, 5]
- [ ] CHK004 - ¿Se especifican las plataformas y superficies a las que se destina cada asset, incluyendo icono PWA, icono Apple, favicon y símbolo dentro de la app cuando correspondan? [Completeness, Brief §§3, 5; Spec §FR-023]

## Requirement Clarity

- [ ] CHK005 - ¿“Reconocible a 24 px” tiene un criterio de evaluación claro respecto de la legibilidad solicitada a 16, 24, 32 y 48 px? [Clarity, Measurability, Brief §§1, 5]
- [ ] CHK006 - ¿El requisito de cuatro conceptos en una lámina 2x2 aclara qué alternativa seguir cuando la herramienta no admita variaciones o no respete la composición? [Clarity, Exception Flow, Brief §1]
- [ ] CHK007 - ¿El área segura del 80% del lienzo de 1024 × 1024 define con precisión si se mide sobre el símbolo, su caja envolvente o el contenido completo del icono? [Clarity, Brief §3]
- [ ] CHK008 - ¿Los requisitos distinguen el fondo neutro de exploración, la transparencia del símbolo refinado y los fondos planos de cada icono final? [Clarity, Brief §§1–3]
- [ ] CHK009 - ¿La dirección cromática distingue roles y variantes —tintas del símbolo, fondos de icono y acento opcional— sin tratar colores exploratorios como tokens de marca ya aprobados? [Clarity, Assumption, Brief §§1–3]

## Requirement Consistency

- [ ] CHK010 - ¿Las restricciones contra texto, letras, cifras, moneda, clichés bancarios y mockups son coherentes en los prompts de exploración, refinamiento, icono y SVG? [Consistency, Brief §§1–4]
- [ ] CHK011 - ¿La prohibición de imitar marcas financieras es consistente entre los criterios de originalidad y las instrucciones para generar o reconstruir variantes? [Consistency, Brief §§1, 5]
- [ ] CHK012 - ¿Queda clara la diferencia entre un símbolo sin wordmark, el nombre Mave compuesto con tipografía real y un icono instalable que no lleva texto? [Consistency, Clarity, Brief §§2, 3, 5]
- [ ] CHK013 - ¿La identidad para temas claro/oscuro y las variantes de icono especifican fondos y tintas compatibles entre sí, sin contradicciones entre transparencia y fondo sólido? [Consistency, Brief §§2–3; Spec §FR-024]

## Acceptance Criteria Quality

- [ ] CHK014 - ¿Los criterios de legibilidad indican qué se considera aceptable en cada tamaño objetivo y sobre cada tipo de fondo, en vez de limitarse a pedir una revisión? [Measurability, Brief §5]
- [ ] CHK015 - ¿Los criterios de originalidad explican qué referencias comparar y qué señales de confusión con marcas financieras impedirían adoptar el concepto? [Measurability, Brief §§1, 5]
- [ ] CHK016 - ¿Los requisitos de aceptación del SVG especifican verificablemente `viewBox`, área segura, máximo de formas, colores, transparencia y ausencia de recursos externos o código activo? [Acceptance Criteria, Brief §4]
- [ ] CHK017 - ¿El master final queda definido como vector revisado y separado de la imagen generada usada solo para explorar conceptos? [Acceptance Criteria, Brief §§1, 4–5]

## Scenario Coverage

- [ ] CHK018 - ¿La exploración requiere conceptos suficientemente separados, sin etiquetas, para compararlos y recortarlos sin introducir elementos de presentación? [Coverage, Brief §1]
- [ ] CHK019 - ¿El refinamiento especifica cómo conservar la idea elegida y limitar cambios de forma, proporción y elementos nuevos? [Coverage, Clarity, Brief §2]
- [ ] CHK020 - ¿El flujo desde un símbolo aprobado hasta iconos claros y oscuros define qué referencia se conserva y cómo se asigna cada variante a su fondo? [Coverage, Brief §§2–3; Spec §FR-024]
- [ ] CHK021 - ¿La preparación de exportaciones relaciona tamaños `192×192`, `512×512` y `180×180` con sus destinos (manifest y Apple), y aclara cuándo hace falta favicon? [Coverage, Clarity, Brief §3]

## Edge Case Coverage

- [ ] CHK022 - ¿Se define cómo descartar o rehacer una generación con texto ilegible, etiquetas accidentales, geometría defectuosa o cambios respecto de la referencia? [Edge Case, Recovery, Brief §§1–3]
- [ ] CHK023 - ¿Se especifica qué hacer si el SVG entregado contiene elementos prohibidos, referencias externas o estructura inválida para navegadores? [Edge Case, Recovery, Brief §4]
- [ ] CHK024 - ¿Los requisitos explican qué variantes y fondos se necesitan cuando el símbolo se usa fuera del contexto exacto de los iconos de plataforma? [Edge Case, Gap, Brief §§2–3, 5]

## Non-Functional Requirements

- [ ] CHK025 - ¿Los requisitos distinguen la legibilidad/contraste visual de marca de los requisitos WCAG aplicables a los controles e interfaz, sin trasladar criterios entre superficies incompatibles? [Non-Functional, Consistency, Spec §FR-025; Brief §5]
- [ ] CHK026 - ¿La escalabilidad del vector y la legibilidad del símbolo a tamaños pequeños están expresadas como criterios aplicables a todas las variantes, no solo al concepto inicial? [Non-Functional, Coverage, Brief §§1, 4–5]

## Dependencies & Assumptions

- [ ] CHK027 - ¿Se documentan las dependencias de cada etapa —imagen de referencia seleccionada, capacidades de variación de la herramienta y herramienta de exportación— junto con una alternativa si faltan? [Dependency, Exception Flow, Brief §§1–4]
- [ ] CHK028 - ¿Se especifican procedencia y permisos de uso de la tipografía, librería de iconos, recursos externos y assets derivados antes de adoptarlos? [Dependency, Gap, Brief §§1, 5]

## Ambiguities & Conflicts

- [ ] CHK029 - ¿El estado “logo e identidad final pendientes” se concilia con la dirección cromática y estilística del brief, dejando claro qué es exploración y qué decisión requiere aprobación? [Ambiguity, Brief §§1–2]
- [ ] CHK030 - ¿Está claro quién decide la originalidad, legibilidad y adopción final, y qué criterios documentados permiten resolver desacuerdos entre conceptos? [Ambiguity, Dependency, Brief §§1, 5]

## Notes

- Dejar todos los ítems nuevos sin marcar; solo la persona revisora decide si corresponde `[x]`.
- Cada ítem evalúa si los requisitos están completos, claros, consistentes y medibles; ninguno certifica que un asset o componente funcione.
- `/speckit-implement` puede leer el estado de la checklist, pero no debe modificar sus marcadores.
- `checklists/requirements.md` es una checklist integrada distinta y mantiene su ciclo de vida propio.
- Añadir observaciones de revisión junto al ítem correspondiente, sin cambiarlo por un caso de prueba de implementación.
