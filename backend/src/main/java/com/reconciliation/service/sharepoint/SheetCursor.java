package com.reconciliation.service.sharepoint;

import com.reconciliation.entity.SuiviCompenseOpEntity;
import com.reconciliation.service.SuiviCompenseOpImportService.ParsedRow;
import com.reconciliation.service.SuiviCompenseOpSaveService;

import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/**
 * Choix des lignes à charger dans une feuille à partir du curseur (dernière ligne chargée).
 *
 * <ul>
 *   <li>Le curseur n'est retenu que si la ligne qu'il désigne porte toujours la même empreinte
 *       (clé de doublon) ; sinon (lignes insérées, supprimées ou modifiées au-dessus), la feuille
 *       est relue depuis l'en-tête et le contrôle de doublon écarte ce qui est déjà en base.</li>
 *   <li>Seules les lignes situées après le curseur sont examinées ; parmi elles, seules celles du
 *       mois visé sont chargées.</li>
 *   <li>Une ligne incomplète (sans date ou sans montant) n'est pas chargée et bloque l'avancée du
 *       curseur : elle sera relue au prochain passage, une fois complétée.</li>
 * </ul>
 */
public final class SheetCursor {

    private SheetCursor() {}

    /**
     * @param toLoad       lignes du mois visé, situées après le curseur
     * @param examined     lignes non vides examinées (après le curseur)
     * @param horsMois     lignes complètes datées d'un autre mois (non chargées)
     * @param incompletes  lignes sans date ou sans montant (non chargées, relues plus tard)
     * @param newCursor    dernière ligne traitée définitivement (null : aucune)
     * @param newCursorKey empreinte de la ligne {@code newCursor}
     * @param cursorReset  le curseur précédent n'était plus valable : feuille relue entièrement
     */
    public record Selection(List<SuiviCompenseOpEntity> toLoad, int examined, int horsMois, int incompletes,
                            Integer newCursor, String newCursorKey, boolean cursorReset) {}

    public static Selection select(List<ParsedRow> rows, Integer cursor, String cursorKey, YearMonth month) {
        Integer effective = cursor;
        boolean reset = false;
        if (cursor != null) {
            ParsedRow atCursor = rows.stream().filter(r -> r.rowIndex() == cursor).findFirst().orElse(null);
            if (atCursor == null || cursorKey == null
                    || !Objects.equals(cursorKey, SuiviCompenseOpSaveService.dedupKey(atCursor.entity()))) {
                effective = null;
                reset = true;
            }
        }
        List<SuiviCompenseOpEntity> toLoad = new ArrayList<>();
        int examined = 0;
        int horsMois = 0;
        int incompletes = 0;
        Integer newCursor = effective;
        String newKey = effective == null ? null : cursorKey;
        boolean blocked = false;
        for (ParsedRow row : rows) {
            if (effective != null && row.rowIndex() <= effective) continue;
            examined++;
            SuiviCompenseOpEntity e = row.entity();
            if (e.getDateOperation() == null || e.getMontant() == null) {
                incompletes++;
                blocked = true;
                continue;
            }
            if (YearMonth.from(e.getDateOperation()).equals(month)) {
                toLoad.add(e);
            } else {
                horsMois++;
            }
            if (!blocked) {
                newCursor = row.rowIndex();
                newKey = SuiviCompenseOpSaveService.dedupKey(e);
            }
        }
        return new Selection(toLoad, examined, horsMois, incompletes, newCursor, newKey, reset);
    }
}
