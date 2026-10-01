import { PAISES, codigoPais } from "../../lib/paises";

// Localidades sugeridas, no un padrón exhaustivo. El formulario permite otra localidad.
export const PAISES_OCUPANTES = [
  {
    codigo: "AR",
    nombre: "Argentina",
    localidades: [
      "Ciudad Autónoma de Buenos Aires",
      "La Plata",
      "Mar del Plata",
      "Bahía Blanca",
      "Córdoba",
      "Rosario",
      "Santa Fe",
      "Mendoza",
      "San Miguel de Tucumán",
      "Salta",
      "San Salvador de Jujuy",
      "Posadas",
      "Resistencia",
      "Corrientes",
      "Paraná",
      "Neuquén",
      "San Carlos de Bariloche",
      "Comodoro Rivadavia",
      "Río Gallegos",
      "Ushuaia",
      "San Juan",
      "San Luis",
      "Santiago del Estero",
      "Formosa",
      "La Rioja",
      "San Fernando del Valle de Catamarca",
      "Santa Rosa",
      "Rawson",
      "Viedma",
    ],
  },
  {
    codigo: "BR",
    nombre: "Brasil",
    localidades: [
      "São Paulo",
      "Rio de Janeiro",
      "Brasília",
      "Belo Horizonte",
      "Porto Alegre",
      "Curitiba",
      "Florianópolis",
      "Foz do Iguaçu",
      "Salvador",
      "Recife",
      "Fortaleza",
      "Manaus",
      "Belém",
      "Goiânia",
      "Campinas",
    ],
  },
  {
    codigo: "CL",
    nombre: "Chile",
    localidades: [
      "Santiago",
      "Valparaíso",
      "Viña del Mar",
      "Concepción",
      "La Serena",
      "Antofagasta",
      "Iquique",
      "Arica",
      "Temuco",
      "Valdivia",
      "Puerto Montt",
      "Punta Arenas",
      "Talca",
      "Rancagua",
      "Chillán",
    ],
  },
  {
    codigo: "UY",
    nombre: "Uruguay",
    localidades: [
      "Montevideo",
      "Punta del Este",
      "Maldonado",
      "Colonia del Sacramento",
      "Salto",
      "Paysandú",
      "Rivera",
      "Tacuarembó",
      "Melo",
      "Mercedes",
      "Rocha",
      "Minas",
      "Durazno",
      "Florida",
      "Canelones",
    ],
  },
  {
    codigo: "PY",
    nombre: "Paraguay",
    localidades: [
      "Asunción",
      "Ciudad del Este",
      "Encarnación",
      "Luque",
      "San Lorenzo",
      "Lambaré",
      "Fernando de la Mora",
      "Capiatá",
      "Limpio",
      "Mariano Roque Alonso",
      "Pedro Juan Caballero",
      "Concepción",
      "Villarrica",
      "Caaguazú",
      "Pilar",
    ],
  },
  {
    codigo: "BO",
    nombre: "Bolivia",
    localidades: [
      "La Paz",
      "Santa Cruz de la Sierra",
      "Cochabamba",
      "Sucre",
      "Oruro",
      "Potosí",
      "Tarija",
      "Trinidad",
      "Cobija",
      "El Alto",
      "Montero",
      "Quillacollo",
      "Sacaba",
      "Yacuiba",
      "Villazón",
    ],
  },
];

// Países que ofrecen los selectores de nacionalidad, país de residencia y país emisor: el catálogo
// ISO completo (lib/paises.js), con Argentina primero y el resto por nombre. Los países con
// localidades sugeridas (arriba) las conservan; en los demás la localidad se escribe.
const LOCALIDADES_SUGERIDAS = new Map(PAISES_OCUPANTES.map((p) => [p.codigo, p.localidades]));

export const PAISES_SELECTOR = PAISES.map(([codigo, nombre]) => ({
  codigo,
  nombre,
  localidades: LOCALIDADES_SUGERIDAS.get(codigo) || [],
})).sort((a, b) => {
  if (a.codigo === "AR") return -1;
  if (b.codigo === "AR") return 1;
  return a.nombre.localeCompare(b.nombre, "es");
});

// Reconoce el país por código o por nombre (también valores históricos), sin reescribir la identidad
// guardada del ocupante.
export function buscarPaisOcupante(valor) {
  const codigo = codigoPais(valor);
  return codigo ? PAISES_SELECTOR.find((p) => p.codigo === codigo) : undefined;
}
