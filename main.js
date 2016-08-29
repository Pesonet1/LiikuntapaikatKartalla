//Ohjaa WFS-osoitteen eri sivun kautta, jolla estetaan CORS restriction
(function() {
  var cors_api_host = 'cors-anywhere.herokuapp.com';
  var cors_api_url = 'https://' + cors_api_host + '/';
  var slice = [].slice;
  var origin = window.location.protocol + '//' + window.location.host;
  var open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function() {
    var args = slice.call(arguments);
    var targetOrigin = /^https?:\/\/([^\/]+)/i.exec(args[1]);
    if (targetOrigin && targetOrigin[0].toLowerCase() !== origin &&
      targetOrigin[1] !== cors_api_host) {
        args[1] = cors_api_url + args[1];
      }
    return open.apply(this, args);
  };
})();


//WFS-layerin pisteet CQL-filterilla
var vectorSource = new ol.source.Vector({
  format: new ol.format.GeoJSON(),
  url: function(extent, resolution, projection) {
    return "http://lipas.cc.jyu.fi/geoserver/lipas/ows?service=WFS&version=1.1.0&request=GetFeature&typename=lipas:lipas_kaikki_pisteet&outputFormat=application/json&srsname=EPSG:3857&" +
	'CQL_FILTER=(bbox(the_geom,' + extent.join(',') + 
	",'EPSG:3857'" + ')' +
	filtering_wfs.value +
	filtering_search.value + "'%25" +
	filter.value + 
	"%25'))";
  },
  strategy: ol.loadingstrategy.tile(ol.tilegrid.createXYZ({
    maxZoom: 16
  }))
});


//Funktio, jonka avulla paivitetaan WFS-layerin pisteita uudelleen haussa
function update() {  
  hakusana = document.getElementById('filter').value
  hakusana = hakusana.toLowerCase();
  vectorSource.clear(true);
};

function resetFilter() {
  document.getElementById('filter').value = null;
  update();
};



//Paafunktio koko applikaation toiminnalle
function init() {

	//Kartassa kÃ¤ytettÃ¤vÃ¤t muuttujat
	var map, view, overviewMapControl, wfs_layer; //lipas

	//Paikannuksessa kaytettavat muuttujat
	var geolocation, accuracyFeature, accuracyBuffer, coordinates;
	
	//Kohteen valitsemisen muuttujat
	var selectInteraction, selectedFeatures

	//pgRouting kaytettavat muuttujat
	var transform, params, extent, r_padding, coord;
	var startPoint, destPoint, vectorlayer;

	//Nappi-muuttujat
	var trackButton = document.getElementById('track');
	var new_start_pointButton = document.getElementById('new_start');
	var navigateButton = document.getElementById('navigate');
	var clearButton = document.getElementById('clear'); 

	//innerHTML containerit
	var tarkkuus_info = document.getElementById('tarkkuus');
	var feature_info = document.getElementById('information');
	var error_info = document.getElementById('information');


	//Asettaa nakyman Helsingin keskustaan
	view = new ol.View({
	  center: [2779257.6943, 8439166.6796],
	  zoom: 12,
	  minZoom: 11,
	  maxZoom: 16
	});

	//Kustomoidaan pikkukartta
	overviewMapControl = new ol.control.OverviewMap({
  	// see in overviewmap-custom.html to see the custom CSS used
  	  className: 'ol-overviewmap ol-custom-overviewmap',
  	  layers: [
    	    new ol.layer.Tile({
      	      source: new ol.source.OSM({
        	'url': 'http://{a-c}.tile.opencyclemap.org/cycle/{z}/{x}/{y}.png'
      	      })
    	    })
  	  ],
  	  collapseLabel: '\u00BB',
  	  label: '\u00AB',
  	  collapsed: false
	});


	map = new ol.Map({
	  renderer: "canvas",
	  controls: ol.control.defaults({
	    attribution: false
	  }).extend([
	    overviewMapControl
	  ]),
	  interactions: ol.interaction.defaults().extend([
	    new ol.interaction.DragRotateAndZoom()
	  ]),
	  layers: [
	    new ol.layer.Tile({
	    source: new ol.source.OSM()
	  })],
	  target: "map",
	  view: view 
	});

	map.addControl(new ol.control.Zoom());


	//WFS-layerin muotoilu
	wfs_layer = new ol.layer.Vector({
  	  source: vectorSource,
  	  style: new ol.style.Style({
	    image: new ol.style.Circle({
	      radius: 6,
	      fill: new ol.style.Fill({color: 'rgba(57,155,221,1)'}),
	      stroke: new ol.style.Stroke({color: 'rgba(31,119,180,1)', width: 2})
    	    })
 	  })
	});

	map.addLayer(wfs_layer);


	//Aloitus- ja lopetuskohteet ja niiden muotoilut
	startPoint = new ol.Feature();
	startPoint.setStyle(new ol.style.Style({
	  image: new ol.style.Circle({
	    radius: 6,
	    fill: new ol.style.Fill({
	      color: '#FF0000'
	    }),
	    stroke: new ol.style.Stroke({
	      color: '#000000',
	      width: 2
	    })
	  })
	}));

	destPoint = new ol.Feature();
	destPoint.setStyle(new ol.style.Style({
	  image: new ol.style.Circle({
	    radius: 6,
	    fill: new ol.style.Fill({
	      color: '#FF0000'
	    }),
	    stroke: new ol.style.Stroke({
	      color: '#000000',
	      width: 2
	    })
	  })
	}));

	//Vektorilayeri aloitus- ja lopetuskohteille
	vectorLayer = new ol.layer.Vector({
  	  source: new ol.source.Vector({
    	  	features: [startPoint, destPoint]
  	  })
	});

	map.addLayer(vectorLayer);


	//Geolocation, asettaa samalla reitinhaun aloitussijainnin
	geolocation = new ol.Geolocation({
	  trackingOptions: {
	    enableHighAccuracy: true
	  },
  	  projection: view.getProjection(),
	  tracking: true
	});	

	//Asettaa tarkkuusalueen
	accuracyFeature = new ol.Feature();
	accuracyBuffer = new ol.layer.Vector({
	  map: map,
	  source: new ol.source.Vector({
	    features: [accuracyFeature]
	  })
	});

	map.addLayer(accuracyBuffer); 
	

	//Tata funktiota kutsutaan aina, kun kayttaja painaa paikanna nappia
	trackButton.addEventListener('click',function(event) {
 
	  //Hakee kayttajan sijainnin ja asettaa siihen aloituspisteen
	  coordinates = geolocation.getPosition();
	  startPoint.setGeometry(new ol.geom.Point(coordinates));
	
	  //Muuttaa oletuszoomin- ja paikan
	  view.setZoom(14);
	  view.setCenter(coordinates);

	  //Tarkkuusbufferi asetetaan kartalle
  	  accuracyFeature.setGeometry(geolocation.getAccuracyGeometry());

	  //Tarkkuuden ilmoittaminen
	  tarkkuus_info.innerHTML = '';
	  tarkkuus_info.innerHTML = 'GIS Software Development Course / Paikannustarkkuus: ' + Math.round(geolocation.getAccuracy()) + 'm';
 	});	

	
	//Handle geolocation error 
	geolocation.on('error', function(error) {
  	  error_info.innerHTML = error.message;
  	  error_info.style.display = '';
	});
	

	// valittujen kohteiden muotoilu
	selectedstyle = new ol.style.Style({
	  image: new ol.style.Circle({
	    radius: 8,
	    fill: new ol.style.Fill({
	      color: 'rgba(57,155,221,1)'
	    }),
	    stroke: new ol.style.Stroke({
	      color: '#000000',
	      width: 2
	    })
	  })
	}); 

	//Mahdollistaa layerin kohteiden valitsemisen
	selectInteraction = new ol.interaction.Select({
          layers: function(layer) {
            return layer.get('selectable') == true;
          },
          style: [selectedstyle]
      	});

	map.getInteractions().extend([selectInteraction]);
	wfs_layer.set('selectable',true); 
	

	//Vain valittujen kohteiden funktio koordinaattien ja tietojen saamiseen
	selectedFeatures = selectInteraction.getFeatures();	
	selectedFeatures.on('add', function(event) {
	
	  //Klikatusta kohteesta muodostetaan muuttuja
	  feature = event.target.item(0)	

	  //Otetaan muuttujaksi kohteen koordinaatit
	  geometry = feature.getGeometry();
	  coord = geometry.getCoordinates();	  

	  //Muuttaa urlin alun, jos se alkaa www., koska muuten linkit eivat toimi
	  url = feature.get('www');

	  if (url != null) {
	    if (url.charAt(0) == 'w') {
	      new_url = 'http://' + url
	    }
	    else {  
	      new_url = url
	    }
	  }
	  else {
	    new_url = ''
	  }

	  url_name = new_url

	  if (url_name.length > 35) {
	    url_name = url_name.substring(0, 35);
	    url_name = url_name + "..."
	  }

	  feature_info.innerHTML = '';
	  feature_info.innerHTML += feature.get('tyyppi_nimi_fi') + ':  ' + feature.get('nimi_fi') + '<br>' + '<a href="' + new_url + '" ' + 'target="_blank">' + url_name + '</a>' + '<br><br>';

	});

	//Palauttaa kohteiden tiedon defaultiksi, kun kayttaja klikkaa muutakuin kohdetta
	map.on('click', function() {
	  selectedFeatures.clear();
	  feature_info.innerHTML = 'Klikkaa liikuntakohdetta nÃ¤hdÃ¤ksesi sen tiedot';
	});
	


	//Lisaa aloitussijainti, jos omaa sijaintia ei voida kayttaa
	new_start_pointButton.addEventListener('click', function(event) {

	  //Otetaan paikannustarkkuus luku pois 
	  tarkkuus_info.innerHTML = 'GIS Software Development Course';

	  //Poista aloituspiste ja tarkkuusbufferi
	  startPoint.setGeometry(null);
	  accuracyFeature.setGeometry(null);

	  //Aseta uusi aloituspiste kayttajan maaraamana
	  map.once('click', function(event) {
	    startPoint.setGeometry(new ol.geom.Point(event.coordinate));
	  });
	});



	//pgRoutingin parametrit
	params = {
  	  LAYERS: 'pgrouting:pgrouting',
  	  FORMAT: 'image/png'
	};

	//Transform coordinates from EPSG:3857 to EPSG:4326.
	transform = ol.proj.getTransform('EPSG:3857', 'EPSG:4326');



	//Mahdollistaa reitin laskun silloin, kun kayttaja on paattanyt kohteen	
	navigateButton.addEventListener('click', function(event) {

	 //Tarkistaa onko reitti jo olemassa ja poistaa sen 
	  if (typeof result !== 'undefined') {	
	    map.removeLayer(result);
	  } 

	 //Pyytaa kayttajaa valitsemaan kohteen, jos se puuttuu
	  if (typeof coord == 'undefined') {
	    alert("Valitse kohde!");
	  }

	 //Pyytaa kayttajalta aloitussijaintia, jos se puuttuu
	  if (startPoint.getGeometry() == null) {
	    alert("Aseta aloitussijainti ensin!");
	    destPoint.setGeometry(null);
	  }
	  
	  //Asettaa loppupisteen vain featureen
  	  else { 
   	    destPoint.setGeometry(new ol.geom.Point(coord));

	    // Transform from EPSG:3857 to EPSG:4326
    	    var startCoord = transform(startPoint.getGeometry().getCoordinates());
    	    var destCoord = transform(destPoint.getGeometry().getCoordinates());
    	    var viewparams = [
      	      'x1:' + startCoord[0], 'y1:' + startCoord[1],
      	      'x2:' + destCoord[0], 'y2:' + destCoord[1]
    	    ];
 
	    //Lahettaa parametrit palvelimelle, joka laskee reitin 
    	    params.viewparams = viewparams.join(';');
    	    result = new ol.layer.Image({
      	      source: new ol.source.ImageWMS({
                url: 'http://130.233.249.20:8080/geoserver/pgrouting/wms',
                params: params
      	      })
    	    });

	    map.addLayer(result);

	    //Muuttaa nakyman reitin mukaisesti
	    start = startPoint.getGeometry().getCoordinates();
	    end = destPoint.getGeometry().getCoordinates();
	    new_x = ((start[0] + end[0]) / 2)
	    new_y = ((start[1] + end[1]) / 2)
	    view.setCenter([new_x, new_y]);
	    
	    //Zoomaa nakyman aloituspaikan ja kohteen mukaan
	    if (start[0] < end[0]) { 
		minx = start[0] 
		maxx = end[0]}
	    else {
		minx = end[0]
		maxx = start[0]}
	
 	    if (start[1] < end[1]) {
		miny = start[1]
		maxy = end[1]}
	    else {
		miny = end[1]
		maxy = start[1]}

	    r_padding = [50, 325, 150, 50];
	    extent = [minx, miny, maxx, maxy];
	    map.getView().fit(extent, map.getSize(), {
		padding: r_padding,
		constrainResolution: false
		});
	    
	   }
	});

	//Poistaa kartalle lisatyn reitin
  	clearButton.addEventListener('click', function(event) {
  	  destPoint.setGeometry(null);
  	  map.removeLayer(result);
	});

}

