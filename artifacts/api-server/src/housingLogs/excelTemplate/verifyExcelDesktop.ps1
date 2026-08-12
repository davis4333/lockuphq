param(
  [Parameter(Mandatory = $true)]
  [string]$WorkbookDirectory
)

$resolvedDirectory = (Resolve-Path -LiteralPath $WorkbookDirectory).Path
$files = Get-ChildItem -LiteralPath $resolvedDirectory -Filter '*-editable-fake.xlsx' | Sort-Object Name
$excel = $null
$results = @()

try {
  $excel = New-Object -ComObject Excel.Application
  $excel.Visible = $false
  $excel.DisplayAlerts = $false
  foreach ($file in $files) {
    $book = $null
    $sheet = $null
    try {
      # Normal read-only open. No repair/corrupt-load option is supplied.
      $book = $excel.Workbooks.Open($file.FullName, 0, $true)
      $sourceSheet = $file.BaseName.Replace('-editable-fake', '')
      $sheet = $book.Worksheets.Item($sourceSheet)
      $results += [ordered]@{
        fileName = $file.Name
        sourceSheet = $sourceSheet
        openedNormallyWithoutRepair = $true
        worksheetCount = $book.Worksheets.Count
        printArea = $sheet.PageSetup.PrintArea
        paperSize = $sheet.PageSetup.PaperSize
        orientation = $sheet.PageSetup.Orientation
        embeddedShapeCount = $sheet.Shapes.Count
        editableCellSample = $sheet.Range('B4').Value2
      }
    }
    catch {
      $results += [ordered]@{
        fileName = $file.Name
        openedNormallyWithoutRepair = $false
        error = $_.Exception.Message
      }
    }
    finally {
      if ($book) { $book.Close($false) }
      if ($sheet) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($sheet) }
      if ($book) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($book) }
    }
  }
}
finally {
  if ($excel) {
    $excel.Quit()
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}

$report = [ordered]@{
  method = 'Microsoft Excel desktop COM automation using normal read-only Workbooks.Open'
  automated = $true
  workbookCount = $results.Count
  allOpenedNormallyWithoutRepair = -not ($results.openedNormallyWithoutRepair -contains $false)
  results = $results
}
$reportPath = Join-Path $resolvedDirectory 'excel-desktop-verification.json'
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $reportPath -Encoding UTF8
$report | ConvertTo-Json -Depth 6
if (-not $report.allOpenedNormallyWithoutRepair) { exit 1 }
