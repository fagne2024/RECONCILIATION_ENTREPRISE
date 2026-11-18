/**
 * Formulaire de ticket GLPI (création sans paramètre, consultation avec `?id=`).
 * GLPI est servi à la racine du domaine : l'ancien chemin `/glpi/public/front/...`
 * redirigeait vers `/front/ticket.form.php` en perdant les paramètres (id, name, content).
 */
export const GLPI_TICKET_FORM_URL = 'https://glpi.intouchgroup.net/front/ticket.form.php';
