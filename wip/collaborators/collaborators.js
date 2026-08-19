// collaborators.js
// Bubble visualisation of the people and institutions the group has published
// with, rendered into #collab-viz on engage.html.
//
// Requires d3 (loaded from a CDN by the page). The collaborator list is
// hardcoded below rather than derived from publications.json, because it
// records co-authors outside the group who have no member record.
//
// To disable the feature, comment out this script tag, the d3 tag, the
// #Collaborators section, its nav link, and its wireToggle call in
// engage.html -- each is marked "COLLABORATORS".

		(function() {
			const COLLABS = [
				{ name: "Helen M Byrne",           institution: "University of Oxford",                        papers: 19 },
				{ name: "Ulrike Tillmann",         institution: "University of Oxford",                        papers: 11 },
				{ name: "Mason A Porter",          institution: "UCLA",                                        papers: 8  },
				{ name: "Michael PH Stumpf",       institution: "University of Melbourne",                     papers: 7  },
				{ name: "Elizabeth Gross",         institution: "University of Hawaiʻi at Mānoa",              papers: 6  },
				{ name: "Kenneth L Ho",            institution: "TSMC",                                        papers: 5  },
				{ name: "Mariano Beguerisse-Díaz", institution: "University of Oxford",                        papers: 4  },
				{ name: "Thomas Thorne",           institution: "University of Surrey",                        papers: 4  },
				{ name: "Lewis Marsh",             institution: "Novo Nordisk",                                papers: 4  },
				{ name: "Alain Goriely",           institution: "University of Oxford",                        papers: 4  },
				{ name: "Nicolette Meshkat",       institution: "Santa Clara University",                      papers: 4  },
				{ name: "Aneesha Bhandari",        institution: "University of Oxford",                        papers: 3  },
				{ name: "Zhouchun Shang",          institution: "BGI-Shenzhen",                                papers: 3  },
				{ name: "Yanan Xing",              institution: "Medical College of Wisconsin",                papers: 3  },
				{ name: "Yanru An",                institution: "BGI-Shenzhen",                                papers: 3  },
				{ name: "Nannan Zhang",            institution: "Karolinska Institutet",                       papers: 3  },
				{ name: "Peter Grindrod",          institution: "University of Oxford",                        papers: 3  },
				{ name: "Robert A Van Gorder",     institution: "University of Otago",                         papers: 3  },
				{ name: "Joshua A Bull",           institution: "University of Oxford",                        papers: 3  },
				{ name: "Anne Shiu",               institution: "Texas A&M University",                        papers: 3  },
				{ name: "Eamonn A Gaffney",        institution: "University of Oxford",                        papers: 2  },
				{ name: "Thomas E Woolley",        institution: "Cardiff University",                          papers: 2  },
				{ name: "Christian Bick",          institution: "Vrije Universiteit Amsterdam",                papers: 2  },
				{ name: "Sarah Filippi",           institution: "Imperial College London",                     papers: 2  },
				{ name: "Vidit Nanda",             institution: "University of Oxford",                        papers: 2  },
				{ name: "Hal Schenck",             institution: "Auburn University",                           papers: 2  },
				{ name: "Zvi Rosen",               institution: "UNH Franklin Pierce",                         papers: 2  },
				{ name: "Gesine Reinert",          institution: "University of Oxford",                        papers: 2  },
				{ name: "Miroslav Kramar",         institution: "University of St Andrews",                    papers: 2  },
				{ name: "Jacek Brodzki",           institution: "University of Southampton",                   papers: 2  },
				{ name: "Agnese Barbensi",         institution: "University of Queensland",                    papers: 2  },
				{ name: "Adrián Inés",             institution: "University of Oxford",                        papers: 2  },
				{ name: "Iolo Jones",              institution: "University of Oxford",                        papers: 2  },
				{ name: "Patrick Rubin-Delanchy",  institution: "University of Oxford",                        papers: 2  },
				{ name: "Darrick Lee",             institution: "University of Chicago",                       papers: 2  },
				{ name: "Rainer Breitling",        institution: "Northumbria University",                      papers: 2  },
				{ name: "Wendy Sadler",            institution: "Cardiff University",                          papers: 1  },
				{ name: "Christoph Flamm",         institution: "University of Vienna",                        papers: 1  },
				{ name: "Nils Weinander",          institution: "University of Oxford",                        papers: 1  },
				{ name: "Bernd Sturmfels",         institution: "MPI for Mathematics in the Sciences",         papers: 1  },
			];

			// Aggregate by institution
			const instMap = {};
			COLLABS.forEach(d => {
				if (!instMap[d.institution]) {
					instMap[d.institution] = { institution: d.institution, papers: 0, people: [] };
				}
				instMap[d.institution].papers += d.papers;
				instMap[d.institution].people.push(d.name);
			});
			const nodes = Object.values(instMap);

			const INST_COLOURS = {
				"University of Oxford":         "#a3bdca",
				"UCLA":                         "#acc2ce",
				"University of Melbourne":      "#c0cace",
				"University of Hawaiʻi":        "#cacece",
				"TSMC":                         "#d5d4cd",
				"University of Surrey":         "#dad5cd",
				"Novo Nordisk":                 "#e2d7cd",
				"Santa Clara University":       "#e7dbce",
				"BGI-Shenzhen":                 "#e1cdc2",
				"Medical College of Wisconsin": "#e8d5d0",
				"Karolinska Institutet":        "#ead8d4",
				"University of Otago":          "#c5c0c2",
				"Texas A&M University":         "#b0b0b2",
				"Cardiff University":           "#ad9c96",
				"Vrije Universiteit Amsterdam": "#948d93",
				"Imperial College London":      "#857b7f",
				"Auburn University":            "#929ba2",
				"UNH Franklin Pierce":          "#8c959f",
			};

			function colour(inst) { return INST_COLOURS[inst] || "#b0b0b2"; }

			document.addEventListener("DOMContentLoaded", function() {
				const container = document.getElementById("collab-viz");
				if (!container) return;

				const W = 860, H = 480;
				const cx = W / 2, cy = H / 2;

				const svg = d3.select(container)
					.append("svg")
					.attr("viewBox", `0 0 ${W} ${H}`);

				const rScale = d3.scaleSqrt()
					.domain([0, d3.max(nodes, d => d.papers)])
					.range([32, 80]);

				nodes.forEach(d => { d.r = rScale(d.papers); });

				const sim = d3.forceSimulation(nodes)
					.force("charge", d3.forceManyBody().strength(6))
					.force("collide", d3.forceCollide(d => d.r + 5).strength(1))
					.force("x", d3.forceX(d => d.institution === "University of Oxford" ? cx : cx + (Math.random() < 0.5 ? -1 : 1) * (200 + Math.random() * 180)).strength(0.15))
					.force("y", d3.forceY(cy).strength(0.08))
					.stop();

				for (let i = 0; i < 400; i++) sim.tick();

				nodes.forEach(d => {
					d.x = Math.max(d.r + 8, Math.min(W - d.r - 8, d.x));
					d.y = Math.max(d.r + 8, Math.min(H - d.r - 8, d.y));
				});

				const tooltip = d3.select(container)
					.append("div")
					.attr("class", "collab-tooltip");

				const nodeG = svg.selectAll("g")
					.data(nodes)
					.join("g")
					.attr("class", "collab-node")
					.attr("transform", d => `translate(${d.x},${d.y})`);

				nodeG.append("circle")
					.attr("r", d => d.r)
					.attr("fill", d => colour(d.institution))
					.attr("fill-opacity", 0.88)
					.attr("stroke", "#fff")
					.attr("stroke-width", 1.5);

				// Institution label inside bubble if large enough
				nodeG.each(function(d) {
					const g = d3.select(this);
					const words = d.institution.split(" ");
					const maxChars = Math.floor(d.r * 0.28);
					// Break into lines of ~maxChars
					const lines = [];
					let line = "";
					words.forEach(w => {
						if ((line + " " + w).trim().length <= maxChars || !line) {
							line = (line + " " + w).trim();
						} else {
							lines.push(line);
							line = w;
						}
					});
					if (line) lines.push(line);
					const fontSize = d.r > 50 ? 11 : d.r > 30 ? 9.5 : 8.5;
					const lineH = fontSize * 1.3;
					const startY = -(lines.length - 1) * lineH / 2;
					lines.forEach((l, i) => {
						g.append("text")
							.attr("text-anchor", "middle")
							.attr("y", startY + i * lineH)
							.attr("dy", "0.35em")
							.style("font-size", fontSize + "px")
							.style("fill", "#333")
							.text(l);
					});
				});

				nodeG
					.on("mouseenter", function(ev, d) {
						const peopleList = d.people.join("<br>");
						tooltip.html(`<strong>${d.institution}</strong>${peopleList}<br><span style="color:#aaa">${d.papers} shared publication${d.papers > 1 ? "s" : ""}</span>`)
							.style("opacity", 1);
					})
					.on("mousemove", function(ev) {
						const rect = container.getBoundingClientRect();
						tooltip
							.style("left", (ev.clientX - rect.left + 12) + "px")
							.style("top", (ev.clientY - rect.top - 10) + "px");
					})
					.on("mouseleave", function() {
						tooltip.style("opacity", 0);
					});

				container.insertAdjacentHTML("beforeend",
					'<p class="collab-caption">Each bubble is an institution, sized by total shared publications. Hover for the people.</p>'
				);
			});
		})();
