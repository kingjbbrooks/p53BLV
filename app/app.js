'use strict'

// web framework

import 'imports-loader?define=>false,exports=>false,this=>window!mustache/mustache'
import 'semantic-ui-offline/semantic.min.css'
import { max as d3Max } from 'd3-array'
import { axisBottom as d3AxisBottom, axisLeft as d3AxisLeft } from 'd3-axis'
import { scaleLinear as d3ScaleLinear } from 'd3-scale'
import { select as d3Select } from 'd3-selection'
import { line as d3Line } from 'd3-shape'

const socket = io()

// custom modules

import './app.sass'
import './index.pug'
import db from './res/dataset.json'
import gene_ref from './res/gene-ref.json'

// for hot module replacement in development

if ('development' === process.env.NODE_ENV)
  require('webpack-hot-middleware/client').subscribe(event => {
    if ('hmr' === event.action) window.location.reload()
  })

///////////////////////////////////////////////////////////////////////////////////////

// global setting

const app = {
  colors: {
    grey : 'rgb(117, 117, 117)',
    red  : 'rgb(219, 54, 41)',
    teal : 'rgb(57, 181, 173)'
  },
  global_browsing_range: document.querySelector("#browse .column[data-browse='global'] input[type='number']").value,
  plot_info_tmpl: document.querySelector('#plot-info script').innerHTML,
  plot_opt: {
    font_size : parseInt(window.getComputedStyle(document.querySelector('html')).getPropertyValue('font-size')),
    height    : 500,
    margin    : { top: 50, right: 40, bottom: 50, left: 40 },
    width     : document.querySelector('.left.column').clientWidth
  },
  promoter_offset: 10000,
  redirection_list: {
    FAM95C : 'http://asia.ensembl.org/Homo_sapiens/Gene/Summary?db=core;g=ENSG00000283486;r=9:38540569-38577207',
    OR8S1  : 'http://asia.ensembl.org/Homo_sapiens/Gene/Summary?db=core;g=ENSG00000284723;r=12:48525632-48528103'
  },
  result_table_status: {
    curr_page_number : 1,
    items_per_page   : 10
  },
  result_tbody_tmpl: document.querySelector('#result tbody script').innerHTML,
  result_tfoot_tmpl: document.querySelector('#result tfoot script').innerHTML,
  result_thead_tmpl: document.querySelector('#result thead script').innerHTML,
  scroll_top: { browse: document.querySelector('#home').clientHeight, home: 0 },
  search_tmpl: document.querySelector('#search script').innerHTML,
  wildtype_datasets: /^D(1|2|3|4|5|6|7|8|9)$/
}
app.plot_opt.width -= 4 * app.plot_opt.font_size
app.scroll_top.search = app.scroll_top.browse + document.querySelector('#browse').clientHeight
Mustache.parse(app.plot_info_tmpl)
Mustache.parse(app.result_tbody_tmpl)
Mustache.parse(app.result_tfoot_tmpl)
Mustache.parse(app.result_thead_tmpl)
Mustache.parse(app.search_tmpl)

document.querySelector('#search tbody').innerHTML = Mustache.render(app.search_tmpl, { db: Object.values(db) })

const plot = (target, range) => {
  socket.emit('plot', app.result_table_status.collection, app.result_table_status.datasets, target, range, (err, start_position, range, data) => {
    if (err) return console.error(err)

    document.querySelector('#plot .menu a[data-page="plot-info"]').click()
    document.querySelector('#plot .menu a[data-page="plot-track"]').classList.add('disabled')

    /********** INFORMATION **********/

    const info = { gene_list: data.gene }, peaks = { clc: {}, homer: {} }

    for (let peak of data.peak) {
      if (!peaks[peak.collection][peak.dataset])
        peaks[peak.collection][peak.dataset] = []

      peak.location = `chr${peak.chr_name}:${peak.peak_start} - ${peak.peak_end}`

      peaks[peak.collection][peak.dataset].push(peak)
    }

    if      ('clc'   === app.result_table_status.collection) delete peaks.homer
    else if ('homer' === app.result_table_status.collection) delete peaks.clc

    for (let category in peaks) {
      info[category] = { datasets: [] }

      for (let dataset of app.result_table_status.datasets) {
        let peaks_in_dataset = peaks[category][dataset]
          ? { dataset: dataset, peak_amount: peaks[category][dataset].length, peaks: peaks[category][dataset].slice() }
          : { dataset: dataset, peak_amount: 1, peaks: [{ location: 'No Peak' }] }
        peaks_in_dataset.first_peak_in_dataset = peaks_in_dataset.peaks.shift()

        info[category].datasets.push(peaks_in_dataset)
      }
    }

    document.querySelector('#plot-info').innerHTML = Mustache.render(app.plot_info_tmpl, info)

    /********** PLOTTING **********/

    const g_height = app.plot_opt.height - app.plot_opt.margin.top - app.plot_opt.margin.bottom,
          g_width  = app.plot_opt.width  - app.plot_opt.margin.right - app.plot_opt.margin.left

    const scaleX = d3ScaleLinear().domain([start_position, start_position + range]).range([0, g_width])

    /********** PEAK **********/

    document.querySelector('#plot-peak').innerHTML = ''

    const y_max = d3Max(Object.values(peaks), datasets => d3Max(Object.values(datasets), peaks => d3Max(peaks, it => it.score || it.localScore))),
          scaleY = d3ScaleLinear().domain([0, Math.max(10, y_max)]).range([g_height, 0]),
          line = d3Line().x(d => scaleX(d.x)).y(d => scaleY(d.y))

    const svg = d3Select('#plot-peak').selectAll('svg').data(app.result_table_status.datasets).enter()
                  .append('svg').style('height', app.plot_opt.height).style('width', app.plot_opt.width)

    const g = svg.append('g').attr('transform', `translate(${app.plot_opt.margin.left},${app.plot_opt.margin.top})`)

    g.append('g').append('text')
      .attr('x', g_width / 2)
      .attr('dy', - app.plot_opt.margin.top / 2)
      .attr('text-anchor', 'middle')
      .style('font-size', app.plot_opt.font_size * 1.3)
      .style('font-style', 'italic')
      .style('text-decoration', 'underline')
      .text(dataset => `${dataset}: ${db[dataset].cellLine}, ${db[dataset].tp53}, ${db[dataset].treatment}`)

    g.append('g').attr('transform', `translate(0,${g_height})`).call(d3AxisBottom(scaleX))
    g.append('g').call(d3AxisLeft(scaleY))
      .append('text')
        .attr('transform', 'rotate(-90)')
        .attr('y', 6)
        .attr('dy', '0.71em')
        .attr('fill', '#000')
        .text('Value')

    for (let category in peaks)
      g.append('g').append('path')
        .attr('fill', app.colors['clc' === category ? 'teal' : 'red'])
        .attr('stroke', app.colors['clc' === category ? 'teal' : 'red'])
        .attr('stroke-linejoin', 'round')
        .attr('stroke-linecap', 'round')
        .attr('stroke-width', 1.5)
        .attr('d', dataset => {
          let data = []

          if (!peaks[category][dataset])
            return

          for (let peak of peaks[category][dataset]) {
            let peak_end   = Math.min(start_position + range, peak.peak_end),
                peak_start = Math.max(start_position, peak.peak_start),
                value      = peak.score || peak.localScore

            data.push({ x: peak_start, y: 0 })
            data.push({ x: peak_start, y: value })
            data.push({ x: peak_end  , y: value })
            data.push({ x: peak_end  , y: 0 })
          }

          return line(data)
        })

    /********** TRACK **********/

    document.querySelector('#plot-track').innerHTML = ''

    if (Object.keys(data.track).length) {
      document.querySelector('#plot .menu a[data-page="plot-track"]').classList.remove('disabled')

      for (let dataset of app.result_table_status.datasets) {
        const scaleY = d3ScaleLinear().domain([0, Math.max(10, d3Max(Object.values(data.track[dataset]), it => d3Max(it)))]).range([g_height, 0]),
              line = d3Line().x((d, i) => scaleX(start_position + i)).y(d => scaleY(d))

        const svg = d3Select('#plot-track').append('svg').datum(dataset).style('height', app.plot_opt.height).style('width', app.plot_opt.width)

        const g = svg.append('g').attr('transform', `translate(${app.plot_opt.margin.left},${app.plot_opt.margin.top})`)

        g.append('g').append('text')
          .attr('x', g_width / 2)
          .attr('dy', - app.plot_opt.margin.top / 2)
          .attr('text-anchor', 'middle')
          .style('font-size', app.plot_opt.font_size * 1.3)
          .style('font-style', 'italic')
          .style('text-decoration', 'underline')
          .text(dataset => `${dataset}: ${db[dataset].cellLine}, ${db[dataset].tp53}, ${db[dataset].treatment}`)

        g.append('g').attr('transform', `translate(0,${g_height})`).call(d3AxisBottom(scaleX))
        g.append('g').call(d3AxisLeft(scaleY))
          .append('text')
            .attr('transform', 'rotate(-90)')
            .attr('y', 6)
            .attr('dy', '0.71em')
            .attr('fill', '#000')
            .text('Value')

        const experiment = g.selectAll('.experiment').data(dataset => Object.keys(data.track[dataset]).map(it => { return { experiment: it, values: data.track[dataset][it] } })).enter()
                            .append('g').attr('class', 'experiment')

        experiment.append('path')
          .attr('fill', 'none')
          .attr('stroke', it => 'p53' === it.experiment ? 'steelblue' : 'green')
          .attr('stroke-linejoin', 'round')
          .attr('stroke-linecap', 'round')
          .attr('stroke-width', 1.5)
          .attr('d', it => line(it.values))
      }
    }

    /********** GENE **********/

    for (let gene of data.gene) {
      gene = {
        end       : scaleX(Math.min(start_position + range, gene.transcript_end)),
        gene_name : gene.gene_name,
        start     : scaleX(Math.max(start_position, gene.transcript_start)),
        strand    : '1' === gene.strand ? '+' : '-'
      }

      const bar = d3Select('#plot').selectAll('svg')
                    .append('g')
                      .attr('transform', `translate(${app.plot_opt.margin.left},${app.plot_opt.height - app.plot_opt.margin.bottom / 2})`)

      bar.append('rect')
        .attr('width', gene.end - gene.start)
        .attr('height', app.plot_opt.margin.bottom * 2 / 5)
        .attr('transform', `translate(${gene.start},0)`)
        .attr('fill', app.colors.grey)

      bar.append('text')
        .attr('x', gene.start)
        .attr('y', app.plot_opt.margin.bottom / 5)
        .attr('dy', app.plot_opt.margin.bottom / 10)
        .attr('fill', '#fff')
        .style('font-style', 'italic')
        .text(`${gene.gene_name} (${gene.strand})`)
    }

    /********** PROMOTER **********/

    if ('global' === app.result_table_status.browse) {
      const chart = d3Select('#plot').selectAll('svg')

      chart.append('g').attr('transform', `translate(${app.plot_opt.margin.left + scaleX(start_position + app.promoter_offset / 2)},${app.plot_opt.margin.top})`)
        .append('path')
          .attr('fill', 'none')
          .attr('stroke', '#000')
          .attr('stroke-width', 1.5)
          .style('stroke-dasharray', 2)
          .attr('d', `M0,0L0,${g_height + app.plot_opt.margin.bottom}`)

      chart.append('g').attr('transform', `translate(${app.plot_opt.margin.left + scaleX(start_position + range - app.promoter_offset / 2)},${app.plot_opt.margin.top})`)
        .append('path')
          .attr('fill', 'none')
          .attr('stroke', '#000')
          .attr('stroke-width', 1.5)
          .style('stroke-dasharray', 2)
          .attr('d', `M0,0L0,${g_height + app.plot_opt.margin.bottom}`)
    }

    document.querySelector('#plot').style.display = 'block'
    window.scroll({
      behavior: 'smooth',
      top: app.scroll_top.search + document.querySelector('#search').clientHeight + document.querySelector('#result').clientHeight
    })
  })
}

const renderTbody = () => {
  let gene_list, table = app.result_table_status

  if (table.reverse)
    gene_list = []
  else
    gene_list = table.gene_list.slice(table.items_per_page * (table.curr_page_number - 1), table.items_per_page * table.curr_page_number)

  document.querySelector('#result tbody').innerHTML = Mustache.render(app.result_tbody_tmpl, { gene_list: gene_list.map(it => {
    let ref = gene_ref[it.gene_name]

    it.datasets = table.datasets.map(dataset => it[dataset] ? '<i class="large green checkmark icon"></i>' : '')
    it.reference = app.redirection_list[it.gene_name] || `http://asia.ensembl.org/Homo_sapiens/Gene/Summary?db=core;g=${ref[0]};r=${ref[1]}:${ref[2]}-${ref[3]};t=${ref[4]}`

    return it

  }) })

  Array.from(document.querySelectorAll('#result tbody a[data-plot]'), dom => dom.onclick = () => plot(dom.dataset.plot, dom.dataset.range))
}

const renderTfoot = () => {
  let table = app.result_table_status

  const tfoot = {
    colspan   : 3 + table.datasets.length,
    last_page : 1 === table.last_page ? false : table.last_page,
    pages     : [table.curr_page_number - 1, table.curr_page_number, table.curr_page_number + 1].filter(it => 1 < it && it < table.last_page)
  }

  if (tfoot.pages.length) {
    if (2 < tfoot.pages[0])
      tfoot.pre_escape = true

    if (table.last_page - 1 > tfoot.pages[tfoot.pages.length - 1])
      tfoot.post_escape = true
  }

  document.querySelector('#result tfoot').innerHTML = Mustache.render(app.result_tfoot_tmpl, tfoot)
  document.querySelector(`#result tfoot a.item[data-page='${table.curr_page_number}']`).classList.add('active')

  Array.from(document.querySelectorAll('#result tfoot a.item[data-page]'), dom => dom.onclick = function () {
    app.result_table_status.curr_page_number = parseInt(this.dataset.page)

    renderTbody(); renderTfoot()
  })

  document.querySelector('#result tfoot a.item[data-page-minus]').onclick = () => {
    if (1 < app.result_table_status.curr_page_number) {
      app.result_table_status.curr_page_number--

      renderTbody(); renderTfoot()
    }
  }

  document.querySelector('#result tfoot a.item[data-page-plus]').onclick = () => {
    if (app.result_table_status.last_page > app.result_table_status.curr_page_number) {
      app.result_table_status.curr_page_number++

      renderTbody(); renderTfoot()
    }
  }
}

///////////////////////////////////////////////////////////////////////////////////////

// DOM event

/************************************** NAVIGATOR **************************************/

Array.from(document.querySelectorAll('.navigator'), dom => dom.onclick = function () {
  window.scroll({ behavior: 'smooth', top: app.scroll_top[this.dataset.hash] })
})

/************************************** BROWSE **************************************/

Array.from(document.querySelectorAll('#browse .column[data-browse]'), dom => dom.onclick = function () {
  document.querySelector('#browse .column[data-browse].chosen').classList.remove('chosen')

  this.classList.add('chosen')
})

/************************************** SEARCH **************************************/

document.querySelector('#search thead .dropdown').onclick = function () {
  event.stopPropagation()

  let body = document.querySelector('body'),
      menu = this.querySelector('.menu')

  menu.classList.toggle('visible')

  body.onclick = () => {
    menu.classList.remove('visible')

    body.onclick = null
  }
}

Array.from(document.querySelectorAll('#search thead .dropdown .menu .item'), dom => dom.onclick = function () {
  let list = this.dataset.list

  this.parentNode.setAttribute('data-list-chosen', list)

  Array.from(document.querySelectorAll('#search tbody td.list'), dom => dom.textContent = list)
})

Array.from(document.querySelectorAll('#search tbody .checkbox input'), dom => dom.onclick = function () {
  this.parentNode.parentNode.parentNode.querySelector('td.list').classList.toggle('disabled')

  if (2 === document.querySelectorAll('#search tbody .checkbox input:checked').length)
    Array.from(document.querySelectorAll('#search tfoot .toggle.checkbox.complement'), it => it.classList.remove('disabled'))
  else {
    Array.from(document.querySelectorAll('#search tfoot .toggle.checkbox.complement'), it => {
      it.classList.add('disabled')
      it.querySelector('input').checked = false
    })
  }
})

Array.from(document.querySelectorAll('#search tfoot .toggle.checkbox input'), dom => dom.onclick = function () {
  Array.from(document.querySelectorAll('#search tfoot .toggle.checkbox input:checked'), it => it.checked = false)

  this.checked = true
})

document.querySelector('#search tfoot .right.button').onclick = function () {
  let action_chosen = document.querySelector('#search tfoot .toggle.checkbox input:checked'),
      browse = document.querySelector('#browse .column[data-browse].chosen').dataset.browse,
      collection = document.querySelector('#search thead .dropdown .menu').dataset.listChosen.toLowerCase(),
      custom_range = document.querySelector("#browse .column[data-browse='customized'] input[type='number']").value,
      custom_target = document.querySelector("#browse .column[data-browse='customized'] input[type='text']").value,
      datasets_chosen = document.querySelectorAll('#search tbody .checkbox input:checked')

  if (!action_chosen || !datasets_chosen.length) return

  if ('customized' === browse && (!custom_range.length || !custom_target.length)) return

  const datasets = []

  Array.from(datasets_chosen, dom => datasets.push(dom.dataset.dataset))

  this.classList.add('loading')

  socket.emit('search', browse, collection, action_chosen.dataset.action, datasets, (err, gene_list) => {
    action_chosen.checked = false

    Array.from(datasets_chosen, dom => {
      dom.checked = false
      dom.parentNode.parentNode.parentNode.querySelector('td.list').classList.toggle('disabled')
    })

    Array.from(document.querySelectorAll('#search tfoot .toggle.checkbox.complement'), it => it.classList.add('disabled'))

    this.classList.remove('loading')

    if (err) return console.error(err)

    app.result_table_status.browse = browse
    app.result_table_status.collection = collection
    app.result_table_status.datasets = datasets.slice()
    app.result_table_status.gene_list = gene_list.slice()

    document.querySelector('#plot').style.display = 'none'

    /********** THEAD **********/

    const thead = { datasets: app.result_table_status.datasets, mutant: 0, wildtype: 0 }

    for (let dataset of app.result_table_status.datasets)
      thead[app.wildtype_datasets.test(dataset) ? 'wildtype' : 'mutant']++

    document.querySelector('#result thead').innerHTML = Mustache.render(app.result_thead_tmpl, thead)

    if ('customized' === browse) {
      document.querySelector('#result tbody').innerHTML = Mustache.render(app.result_tbody_tmpl, { gene_list: [{
        custom_range  : custom_range,
        datasets      : app.result_table_status.datasets.map(() => '<div data-tooltip="click `Link` for advanced search" data-position="bottom center"><i class="large grey warning sign icon"></i></div>'),
        gene_name     : custom_target,
        occurrence    : app.result_table_status.datasets.length
      }] })
      document.querySelector('#result tbody a').removeAttribute('href')
      document.querySelector('#result tbody a[data-plot]').onclick = function () { plot(this.dataset.plot, this.dataset.range) }

      app.result_table_status.curr_page_number = 1
      app.result_table_status.last_page = 1

      renderTfoot()

      document.querySelector('#result tfoot a.item[data-page]').onclick = null

      document.querySelector('#result').style.display = 'block'
      window.scroll({ behavior: 'smooth', top: app.scroll_top.search + document.querySelector('#search').clientHeight })

      return
    }

    Array.from(document.querySelectorAll('#result th[data-dataset]'), dom => dom.onclick = function () {
      let exile = [], owned = []

      for (let gene of app.result_table_status.gene_list) {
        if (gene[this.dataset.dataset]) owned.push(gene)
        else                            exile.push(gene)
      }

      app.result_table_status.gene_list = owned.slice().concat(exile)

      renderTbody()
    })

    document.querySelector('#result th[data-sort-by-occurrence]').onclick = () => {
      app.result_table_status.gene_list.sort((a, b) => b.occurrence - a.occurrence)

      renderTbody()
    }

    /********** TBODY **********/

    app.result_table_status.curr_page_number = 1

    for (let gene of app.result_table_status.gene_list) {
      gene.custom_range = app.global_browsing_range
      gene.occurrence = 0

      app.result_table_status.datasets.forEach(dataset => { if (gene[dataset]) gene.occurrence++ })
    }

    renderTbody()

    /********** TFOOT **********/

    app.result_table_status.last_page = parseInt(app.result_table_status.gene_list.length / app.result_table_status.items_per_page) + 1

    renderTfoot()

    document.querySelector('#result').style.display = 'block'
    window.scroll({ behavior: 'smooth', top: app.scroll_top.search + document.querySelector('#search').clientHeight })
  })
}

/************************************** PLOT **************************************/

Array.from(document.querySelectorAll('#plot .menu a[data-page]'), dom => dom.onclick = function () {
  if (this.classList.contains('disabled'))
    return

  document.querySelector('#plot').dataset.show = this.dataset.page
  document.querySelector('#plot .menu a[data-page].active').classList.remove('active')

  this.classList.add('active')
})
