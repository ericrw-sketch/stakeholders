-- Généré par « npm run import » à partir de data/leads.xlsx. À coller dans Supabase → SQL Editor.
begin;

insert into public.amb_leads (id, wave, priority, name, address, municipality, solar_kwp, production_mwh, companies, consumption_mwh, target_role, owner, pitch, target_function, lat, lng) values
  ('tour-taxis-gare-maritime-hotel-des-douanes', 1, 'A', 'Tour & Taxis — Gare Maritime / Hôtel des Douanes', 'Rue Picard 7, 9 et 11', '1000 Bruxelles', '2 844 (est.)', 2700, 'Nextensa', 330, 'Producteur (priorité) + consommateurs', 'Nextensa SA — propriétaire-développeur du site, domiciliée Rue Picard 11 (info@nextensa.eu)', 'De loin la plus grosse toiture de la liste. Le site produit bien plus qu''il ne consomme : le surplus part aujourd''hui sur le réseau.', 'Asset / property manager, responsable ESG', 50.8662, 4.3478),
  ('herman-teirlinck-siege-de-l-administration-flamande', 1, 'A', 'Herman Teirlinck — siège de l''administration flamande', 'Avenue du Port 88', '1000 Bruxelles', '270 (est.)', 255, 'Ministères de la Communauté flamande, Vlaamse Vereniging voor ICT-personeel, Eigen Vermogen INBO, Natuurinvest', 8440, 'Producteur + consommateur', 'Vlaamse overheid — gestion immobilière par Het Facilitair Bedrijf', 'Même site que Tour & Taxis, à 300 mètres de la Gare Maritime. Petite toiture pour une très grosse consommation : c''est un prosumer.', 'Facility / energy manager de Het Facilitair Bedrijf', 50.869, 4.35),
  ('site-inbev-anderlecht', 1, 'A', 'Site InBev Anderlecht', 'Boulevard Industriel 21', '1070 Anderlecht', '376 (est.)', 355, 'InBev Belgium', 6000, 'Producteur + consommateur', 'AB InBev — occupant et vraisemblablement propriétaire', 'Le plus gros prosumer privé de la liste. Un brasseur consomme en continu, y compris le week-end : le profil idéal pour absorber la production que nos membres n''arrivent pas à placer.', 'Energy manager site / Sustainability manager Belgique', 50.8252, 4.304),
  ('city-center', 1, 'B', 'City Center', 'Boulevard du Jardin Botanique 19-20', '1000 Bruxelles', '439 (est.)', 415, null, 1100, 'Producteur + consommateurs', 'AG REAL ESTATE (propriétaire confirmé)', 'Bonne toiture et un locataire commercial qui consomme en journée, quand le solaire produit. AG Real Estate détient un large portefeuille bruxellois : une porte ouverte ici peut en ouvrir beaucoup d''autres. Voir aussi Interparking, même groupe (ligne vague 2).', 'Asset manager / responsable développement durable AG Real Estate', 50.8545, 4.359),
  ('hopital-delta-chirec', 1, 'B', 'Hôpital Delta — CHIREC', 'Boulevard du Triomphe 201', '1160 Auderghem', '338 (est.)', 320, 'Centre Hospitalier Interrégional Edith Cavell (CHIREC)', 330, 'Consommateur + producteur', 'CHIREC ASBL', 'Situé sur Auderghem, où nous opérons déjà la communauté communale et où la production manque justement. Un hôpital consomme jour et nuit, toute l''année.', 'Directeur technique / facility, ou direction financière', 50.8195, 4.404),
  ('plateforme-four-a-briques', 1, 'B', 'Plateforme Four à Briques', 'Avenue du Four à Briques 6', '1140 Evere', '499 (est.)', 475, 'Much More Market Benelux', 260, 'Producteur (priorité)', 'Much More Market Benelux (occupant) — propriétaire à confirmer', 'Grosse toiture pour une consommation modérée : il y a du surplus à placer. Grossiste alimentaire, donc du froid en continu.', 'Gérant / directeur d''exploitation', 50.87, 4.415),
  ('site-putman-freres', 1, 'C', 'Site Putman Frères', 'Rue Henri-Joseph Genesse 30', '1070 Anderlecht', '251 (est.)', 240, 'Electrotechnique et Mécanique Putman Frères', 40, 'Producteur', 'Putman Frères (occupant) — info@putman.be', 'Toiture nettement surdimensionnée par rapport à la consommation : presque tout part sur le réseau. Installateur électrotechnique, donc un interlocuteur qui comprend le sujet immédiatement — et un prescripteur possible chez ses propres clients.', 'Gérant (contact direct, pas de filtre)', 50.8215, 4.2965),
  ('ancien-site-cora-anderlecht-retail-park', 2, 'A', 'Ancien site Cora Anderlecht (retail park)', 'Quartier Van Kalken / Chaussée de Mons', '1070 Anderlecht', '~1 800 (à vérifier)', 1700, 'Delhaize (franchise Obelgix) et nouveaux occupants du retail park', 1500, 'Producteur (priorité) + consommateurs', 'MITISKA REIM — repreneur des surfaces cora', '25 000 m² de panneaux posés du temps de cora, sur un site dont l''occupation vient d''être entièrement recomposée. Le nouveau propriétaire hérite d''une production calibrée pour un hypermarché qui n''existe plus : il y a presque à coup sûr un surplus à placer, et un propriétaire qui n''a pas encore d''habitude prise sur ce point.', 'Asset manager Mitiska REIM (Belgique)', 50.8195, 4.274),
  ('usine-d-embouteillage-coca-cola', 2, 'A', 'Usine d''embouteillage Coca-Cola', 'Chaussée de Mons 1424', '1070 Anderlecht', 'À vérifier', null, 'Coca-Cola Europacific Partners Belgium (BCE 0425071420)', 5000, 'Consommateur + producteur', 'Coca-Cola Europacific Partners', 'Site de production avec lignes d''embouteillage et froid : consommation lourde et régulière. Le groupe a des objectifs d''électricité renouvelable publics et une équipe énergie structurée, ce qui raccourcit la discussion technique.', 'Energy / sustainability manager Belux, direction de site', 50.8145, 4.2625),
  ('station-d-epuration-bruxelles-nord', 2, 'A', 'Station d''épuration Bruxelles-Nord', 'Avenue de Vilvorde 450', '1130 Bruxelles (Haren)', 'À vérifier', null, 'Aquiris (groupe Veolia)', 4000, 'Consommateur — profil idéal', 'Aquiris SA, concession du groupe Veolia', 'Une station d''épuration tourne 24 heures sur 24, 365 jours par an, avec une consommation très plate. C''est le meilleur profil possible pour absorber ce que nos producteurs bruxellois n''arrivent pas à placer, y compris le week-end. Veolia a par ailleurs un discours public fort sur l''énergie locale.', 'Directeur d''exploitation, responsable énergie Veolia Belgique', 50.897, 4.384),
  ('cliniques-universitaires-saint-luc', 2, 'A', 'Cliniques universitaires Saint-Luc', 'Avenue Hippocrate 10', '1200 Woluwe-Saint-Lambert', 'À vérifier', null, 'Cliniques universitaires Saint-Luc (UCLouvain)', 15000, 'Consommateur + producteur', 'Cliniques universitaires Saint-Luc ASBL', 'L''un des plus gros consommateurs d''électricité de la Région, actif jour et nuit. Chantier de reconstruction en cours, donc un sujet énergie déjà ouvert en interne et un budget en discussion.', 'Directeur technique / infrastructures, direction financière', 50.8535, 4.452),
  ('siege-europeen-toyota-motor-europe', 2, 'B', 'Siège européen Toyota Motor Europe', 'Avenue du Bourget 60', '1140 Evere', 'À vérifier', null, 'Toyota Motor Europe NV/SA', 3000, 'Consommateur + producteur', 'Toyota Motor Europe', 'Grand siège de bureaux avec parkings, sur un site qui se prête aux ombrières. Objectifs carbone de groupe très affichés et direction européenne installée à Bruxelles : la décision se prend ici, pas au Japon.', 'Facility manager, responsable environnement Europe', 50.88, 4.42),
  ('docks-bruxsel', 2, 'B', 'Docks Bruxsel', 'Boulevard Lambermont 1', '1000 Bruxelles', 'À vérifier', null, 'Docks Bruxsel — centre commercial et ses enseignes', 3000, 'Producteur + consommateurs', 'Vendu en 2018 à des investisseurs canadiens — propriétaire actuel à confirmer ; développé par Equilis', 'Centre commercial conçu dès l''origine sur des critères environnementaux (certifié BREEAM), avec une très grande toiture et une centaine d''enseignes locataires. Un accord avec le propriétaire donne accès à tous les occupants d''un coup.', 'Center manager, asset manager du propriétaire', 50.878, 4.37),
  ('site-solvay-neder-over-heembeek', 2, 'B', 'Site Solvay Neder-over-Heembeek', 'Rue de Ransbeek 310', '1120 Bruxelles (NOH)', 'À vérifier', null, 'Solvay SA — centre de recherche et production', 8000, 'Consommateur (gros volume) + producteur', 'Solvay SA', 'Site industriel et de recherche historique, l''un des rares grands sites privés encore en activité dans la Région. Grandes surfaces disponibles et consommation continue. Groupe coté avec une direction énergie constituée.', 'Site manager, energy manager groupe', 50.8995, 4.3905),
  ('plateforme-et-siege-delhaize-osseghem', 2, 'B', 'Plateforme et siège Delhaize — Osseghem', 'Rue Osseghem / quartier Osseghem', '1080 Molenbeek-Saint-Jean', 'À vérifier', null, 'Delhaize Le Lion / Ahold Delhaize Belgique', 4000, 'Consommateur + producteur', 'Ahold Delhaize Belgique', 'Historiquement le site bruxellois du groupe, avec de la surface au sol et du froid. Delhaize vient par ailleurs de reprendre l''exploitation d''anciens sites cora en Région bruxelloise : un accord au niveau du groupe couvrirait plusieurs points de consommation d''un coup.', 'Energy manager Belgique, direction immobilière', 50.8585, 4.323),
  ('portefeuille-de-parkings-bruxellois', 2, 'C', 'Portefeuille de parkings bruxellois', 'Rue de l''Évêque 1 (siège)', '1000 Bruxelles', 'Ombrières à étudier', null, 'Interparking SA', 2000, 'Consommateur + producteur (ombrières)', 'Interparking SA — groupe AG / Ageas', 'Même groupe qu''AG Real Estate, propriétaire du City Center : une introduction d''un côté peut servir de l''autre. Les parkings consomment en continu (ventilation, éclairage) et les niveaux en surface se prêtent aux ombrières photovoltaïques. Beaucoup de points de livraison répartis dans toute la Région.', 'Directeur technique Belgique, responsable développement durable', 50.8505, 4.353)
on conflict (id) do update set
  wave = excluded.wave,
  priority = excluded.priority,
  name = excluded.name,
  address = excluded.address,
  municipality = excluded.municipality,
  solar_kwp = excluded.solar_kwp,
  production_mwh = excluded.production_mwh,
  companies = excluded.companies,
  consumption_mwh = excluded.consumption_mwh,
  target_role = excluded.target_role,
  owner = excluded.owner,
  pitch = excluded.pitch,
  target_function = excluded.target_function,
  lat = excluded.lat,
  lng = excluded.lng,
  updated_at = now();

insert into public.amb_lead_status (lead_id, status) values
  ('tour-taxis-gare-maritime-hotel-des-douanes', 'DÉJÀ APPROCHÉ. Longues discussions avec Tour & Taxis et Nextensa, dont une visite avec Philip. Ils ne nous ont pas pris au sérieux.'),
  ('herman-teirlinck-siege-de-l-administration-flamande', 'Pas encore approché. Décision publique, donc cycle long, mais volume très important.'),
  ('site-inbev-anderlecht', 'Pas encore approché.'),
  ('city-center', 'Propriétaire identifié, pas encore approché. À traiter comme un dossier de portefeuille, pas comme un immeuble isolé.'),
  ('hopital-delta-chirec', 'EN COURS. Introduction demandée à Olivier (commune d''Auderghem) mais si vous avez des entrées, on est preneur.'),
  ('plateforme-four-a-briques', 'Pas encore approché.'),
  ('site-putman-freres', 'Pas encore approché.'),
  ('ancien-site-cora-anderlecht-retail-park', 'On a eu des contacts avec eux et ça patine (Max). Le timing est bon : recomposition récente du site. Ca serait bien d''opérer avec un de vous qui les relance aussi.'),
  ('usine-d-embouteillage-coca-cola', 'Pas approché.'),
  ('station-d-epuration-bruxelles-nord', 'Pas approché. Priorité haute : le profil compte autant que le volume.'),
  ('cliniques-universitaires-saint-luc', 'Pas approché.'),
  ('siege-europeen-toyota-motor-europe', 'Pas approché.'),
  ('docks-bruxsel', 'Pas approché. Propriétaire à identifier avant tout contact. Christophe, tu es chez Equilis non ?'),
  ('site-solvay-neder-over-heembeek', 'Pas approché.'),
  ('plateforme-et-siege-delhaize-osseghem', 'Nous avons déjà plusieurs de leurs franchises en portefeuille. Ca serait plus simple de traiter au niveau groupe, pas magasin par magasin.'),
  ('portefeuille-de-parkings-bruxellois', 'Nous avons approché la juriste avec Eric mais pas de reaction. À coupler avec le dossier AG Real Estate.')
on conflict (lead_id) do update set status = excluded.status;

-- Les immeubles retirés de l'Excel ne sont pas supprimés (leurs contacts seraient perdus).
-- Pour en retirer un : delete from public.amb_leads where id = '...';

commit;
