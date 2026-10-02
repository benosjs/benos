<script>
  import { buildData } from './data.js'

  let rows = []
  let selected = 0

  function update() {
    rows = rows.map((row, index) =>
      index % 10 === 0 ? { ...row, label: `${row.label} !!!` } : row,
    )
  }

  function swapRows() {
    if (rows.length <= 998) return
    const next = rows.slice()
    ;[next[1], next[998]] = [next[998], next[1]]
    rows = next
  }

  function removeRow(id) {
    rows = rows.filter((row) => row.id !== id)
  }
</script>

<div class="container">
  <h1>Svelte keyed benchmark</h1>
  <div class="toolbar">
    <button id="run" onclick={() => (rows = buildData(1000))}>Create 1,000 rows</button>
    <button id="runlots" onclick={() => (rows = buildData(10000))}>Create 10,000 rows</button>
    <button id="add" onclick={() => (rows = rows.concat(buildData(1000)))}>Append 1,000 rows</button>
    <button id="update" onclick={update}>Update every 10th row</button>
    <button id="clear" onclick={() => (rows = [])}>Clear</button>
    <button id="swaprows" onclick={swapRows}>Swap rows</button>
  </div>
  <table>
    <tbody>
      {#each rows as row (row.id)}
        <tr class:selected={selected === row.id}>
          <td>{row.id}</td>
          <td><a onclick={() => (selected = row.id)}>{row.label}</a></td>
          <td><button data-remove={row.id} onclick={() => removeRow(row.id)}>remove</button></td>
          <td></td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
