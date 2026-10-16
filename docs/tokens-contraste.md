# Contrastes des tokens — Phase 2

Date : 16/10/2026. Calculs WCAG 2.2 (luminance relative) exécutés localement
sur les valeurs hexadécimales de `frontend/src/styles/_tokens.scss`.

Les fonds de badges (`*-bg`) sont une approximation RVB de
`color-mix(in srgb, couleur tint-bg%, surface)`. Le rendu navigateur peut
différer de quelques centièmes. Les paires ont été choisies pour rester
au-dessus de 4,5:1 avec une marge.

Aucun contrôle de contraste n’a été mesuré dans un navigateur (pipette sur
pixels rendus, opacités, dégradés).

## Règles

| Usage | Seuil |
|---|---|
| Texte courant | 4,5:1 |
| Grand texte | 3:1 |
| Composant graphique / bordure de contrôle | 3:1 |

`--color-border` est **décoratif** (séparateurs). Les limites de champs et
boutons utilisent `--color-border-strong`.

## Thème clair

| Couple | Ratio | Seuil | Résultat |
|---|---|---|---|
| Texte `#1F2A2E` / fond `#F2EEE4` | 12,68 | 4,5 | OK |
| Texte `#1F2A2E` / surface `#FBF9F4` | 13,97 | 4,5 | OK |
| Atténué `#5F676B` / fond `#F2EEE4` | 4,98 | 4,5 | OK |
| Atténué `#5F676B` / surface `#FBF9F4` | 5,48 | 4,5 | OK |
| Accent `#1D5C63` / surface | 7,22 | 4,5 | OK |
| Texte bouton `#FFFFFF` / accent `#1D5C63` | 7,60 | 4,5 | OK |
| Texte bouton `#FFFFFF` / accent-hover `#174C52` | 9,58 | 4,5 | OK |
| Nav `#FBF9F4` / nav `#1D5C63` | 7,22 | 4,5 | OK |
| Succès `#356D4C` / surface | 5,80 | 4,5 | OK |
| Avertissement `#855A0E` / surface | 5,76 | 4,5 | OK |
| Avertissement `#855A0E` / fond | 5,23 | 4,5 | OK |
| Erreur `#A5453A` / surface | 5,68 | 4,5 | OK |
| Info `#3E5C8A` / surface | 6,43 | 4,5 | OK |
| Doublon `#6A4C8C` / surface | 6,60 | 4,5 | OK |
| Appro `#2B6E6A` / surface | 5,64 | 4,5 | OK |
| Compense `#85502A` / surface | 6,28 | 4,5 | OK |
| Nivellement `#55607A` / surface | 5,97 | 4,5 | OK |
| Crossborder `#8A3F6E` / surface | 6,62 | 4,5 | OK |
| Succès / badge-bg | 4,76 | 4,5 | OK |
| Avertissement / badge-bg | 4,74 | 4,5 | OK |
| Erreur / badge-bg | 4,65 | 4,5 | OK |
| Info / badge-bg | 5,26 | 4,5 | OK |
| Doublon / badge-bg | 5,39 | 4,5 | OK |
| Bordure forte `#857D6E` / surface | 3,87 | 3 | OK |
| Bordure forte `#857D6E` / fond | 3,52 | 3 | OK |
| Bordure décorative `#E0DACB` / surface | 1,33 | 3 | Non applicable (décoratif) |

## Thème sombre

| Couple | Ratio | Seuil | Résultat |
|---|---|---|---|
| Texte `#ECE8DD` / fond `#161B1D` | 14,19 | 4,5 | OK |
| Texte `#ECE8DD` / surface `#1E2527` | 12,71 | 4,5 | OK |
| Atténué `#9AA3A6` / fond | 6,75 | 4,5 | OK |
| Atténué `#9AA3A6` / surface | 6,05 | 4,5 | OK |
| Accent `#6FB7BE` / surface | 6,81 | 4,5 | OK |
| Texte bouton `#161B1D` / accent `#6FB7BE` | 7,61 | 4,5 | OK |
| Texte bouton `#161B1D` / accent-hover `#8AC7CD` | 9,21 | 4,5 | OK |
| Nav `#ECE8DD` / nav `#12282B` | 12,57 | 4,5 | OK |
| Succès `#7CC39A` / surface | 7,51 | 4,5 | OK |
| Avertissement `#E3B45E` / surface | 8,12 | 4,5 | OK |
| Erreur `#EE8E82` / surface | 6,54 | 4,5 | OK |
| Info `#8FB2E8` / surface | 7,19 | 4,5 | OK |
| Doublon `#B79BDD` / surface | 6,48 | 4,5 | OK |
| Appro `#6CC2BA` / surface | 7,46 | 4,5 | OK |
| Compense `#E0A47A` / surface | 7,23 | 4,5 | OK |
| Nivellement `#A9B4CF` / surface | 7,50 | 4,5 | OK |
| Crossborder `#DA94C2` / surface | 6,67 | 4,5 | OK |
| Succès / badge-bg | 5,22 | 4,5 | OK |
| Avertissement / badge-bg | 5,53 | 4,5 | OK |
| Erreur / badge-bg | 4,75 | 4,5 | OK |
| Info / badge-bg | 5,04 | 4,5 | OK |
| Doublon / badge-bg | 4,66 | 4,5 | OK |
| Bordure forte `#6E7A7E` / surface | 3,52 | 3 | OK |
| Bordure forte `#6E7A7E` / fond | 3,93 | 3 | OK |
| Bordure décorative `#2C3639` / surface | 1,26 | 3 | Non applicable (décoratif) |

## Corrections par rapport aux couleurs de référence de la mission

| Référence | Token retenu | Motif |
|---|---|---|
| Texte atténué `#6B7377` | `#5F676B` | 4,17:1 sur `#F2EEE4` |
| Avertissement `#9A6A14` | `#855A0E` | 4,08 / 4,49:1 |
| Succès `#3F7D58` | `#356D4C` | Marge sur les badges teintés |
| Sémantique sombre (mêmes hex que le clair) | Variantes éclaircies | 2,24 à 3,30:1 sur `#1E2527` |
