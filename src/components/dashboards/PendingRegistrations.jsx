import React, { useState, useRef, useEffect } from "react";
// Ensure you have xlsx installed: npm install xlsx
import * as XLSX from "xlsx";
import {
  Download,
  Upload,
  Search,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Eye,
} from "lucide-react";
// Ensure uploadRegistrations and GetregistrationsData are correctly imported
import { GetregistrationsData, uploadRegistrations, updateRegistrationData, deleteRegistration } from "../../../api";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";

// Import the missing dialog components
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// You might need to import a Select component for better styling.
// For simplicity, this example uses a basic <select> element in the JSX.
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


// Set the number of records to display per page
const RECORDS_PER_PAGE = 8;

const PendingRegistrations = () => {
  const [registrations, setRegistrations] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  // NEW STATE: Filter by Status
  const [filterStatus, setFilterStatus] = useState("All"); 

  const fileInputRef = useRef(null);
  const { toast } = useToast();

  // ----------------------------------------------------
  // DIALOG/VIEW STATE & HANDLERS (New/Fixed)
  // ----------------------------------------------------
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedRegistration, setSelectedRegistration] = useState(null);

  const handleViewDetails = (id) => {
    const reg = registrations.find((r) => r.id === id);
    if (reg) {
      setSelectedRegistration(reg);
      setIsDialogOpen(true);
    }
  };

const handleApprove = async () => {
    if (!selectedRegistration) return;

    try {
      setIsLoading(true);
      // Assuming updateRegistrationData handles Status updates for Approval
      await updateRegistrationData(selectedRegistration.id, "Approved");

      toast({
        title: "Success",
        description: `Registration ${selectedRegistration.id} approved.`,
        variant: "success",
      });
      
      // Close dialog and refresh data 
      setIsDialogOpen(false);
      setSelectedRegistration(null);
      await fetchRegistrations(); 
    } catch (error) {
      console.error("Approval error:", error);
      toast({
        title: "Error",
        description: `Failed to approve registration ${selectedRegistration.id}.`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // FIX: Implemented handleReject with API call (using updateRegistrationData for status change)
  const handleReject = async () => {
    if (!selectedRegistration) return;

    try {
      setIsLoading(true);
      // Assuming updateRegistrationData handles Status updates for Rejection
      await updateRegistrationData(selectedRegistration.id, "Rejected");

      toast({
        title: "Success",
        description: `Registration ${selectedRegistration.id} rejected.`,
        variant: "destructive",
      });

      // Close dialog and refresh data
      setIsDialogOpen(false);
      setSelectedRegistration(null);
      await fetchRegistrations();
    } catch (error) {
      console.error("Rejection error:", error);
      toast({
        title: "Error",
        description: `Failed to reject registration ${selectedRegistration.id}.`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ----------------------------------------------------
  // FETCH REGISTRATIONS
  // ----------------------------------------------------
  const fetchRegistrations = async () => {
    setIsLoading(true);
    setCurrentPage(1);
    // Reset filter when fetching fresh data
    setFilterStatus("All"); 

    try {
      const response = await GetregistrationsData();

      // Assuming the API returns an array under the 'data' key
      const apiDataArray = response?.data || [];

      const formatted = apiDataArray.map((reg, index) => ({
        id: reg.regist_id ?? index + 1,
        name: reg.name ?? "",
        phoneNumber: reg.phone_number ?? "",
        email: reg.email_id ?? "",
        address: reg.address ?? "",
        age: reg.age ?? 0,
        // Ensure date is displayed cleanly
        applicationDate: reg.application_date
          ? String(reg.application_date).split("T")[0]
          : "",
        parentName: reg.parent_name ?? "",
        active: reg.active,
        // Key is 'Status' (capital S)
        Status: reg.status,
      }));
      setRegistrations(formatted);
    } catch (error) {
      console.error("Error loading registrations:", error);
      toast({
        title: "Error",
        description: "Failed to load pending registrations.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRegistrations();
  }, []);

  // ----------------------------------------------------
  // SAVE IMPORTED DATA TO DATABASE (Improved Feedback)
  // ----------------------------------------------------
  const handleSaveImportedData = async (dataToSave) => {
    if (dataToSave.length === 0) {
      toast({
        title: "Import Error",
        description: "No valid data to save.",
        variant: "destructive",
      });
      return;
    }

    let totalRecordsAttempted = dataToSave.length;
    let recordsInserted = 0;

    try {
      setIsLoading(true);
      // CALL THE BACKEND API TO BULK UPLOAD THE DATA
      const result = await uploadRegistrations(dataToSave);

      // NOTE: Assuming result has a structure like { inserted: number }
      recordsInserted = result.inserted;

      // Refresh the list to show the newly added data
      await fetchRegistrations();

      if (recordsInserted === totalRecordsAttempted) {
        toast({
          title: "Success",
          description: `${recordsInserted} records successfully imported.`,
        });
      } else if (recordsInserted > 0) {
        // Partial success, due to ON CONFLICT DO NOTHING
        toast({
          title: "Partial Import Success",
          description: `${recordsInserted} records were inserted. ${
            totalRecordsAttempted - recordsInserted
          } records were skipped (likely duplicates).`,
          variant: "default",
        });
      } else {
        // 0 records inserted
        toast({
          title: "No Records Inserted",
          description:
            "All records were skipped. They likely already exist in the database (duplicate email_id).",
          variant: "warning",
        });
      }
    } catch (error) {
      console.error("Database Save Error:", error);
      toast({
        title: "Import Failed",
        description: `Could not save the registrations. Details: ${
          error.message || "Check console for server error."
        }`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // ----------------------------------------------------
  // IMPORT EXCEL (Robust Data Parsing)
  // ----------------------------------------------------
  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const workbook = XLSX.read(event.target.result, { type: "binary" });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        // Read data as an array of arrays (more reliable than JSON for cleanup)
        const rawRows = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: null,
        });

        if (!rawRows || rawRows.length < 2) {
          throw new Error("File is empty or contains no data rows.");
        }

        // The first row is the header, clean it up to match expected keys
        // Converts "Application Date" to "application_date"
        const header = rawRows[0].map((h) =>
          String(h)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9_]+/g, "_")
        );
        const dataRows = rawRows.slice(1);

        const formatted = dataRows
          .map((row, rowIndex) => {
            const rowData = {};
            header.forEach((key, colIndex) => {
              let value = row[colIndex];

              // Handle Excel date numbers (a common source of errors)
              if (typeof value === "number" && key.includes("date")) {
                // Convert Excel Date Number to JS Date object
                const date = XLSX.SSF.parse_date_code(value);
                // Format to YYYY-MM-DD
                value = `${date.y}-${String(date.m).padStart(2, "0")}-${String(
                  date.d
                ).padStart(2, "0")}`;
              }

              // Clean up values: trim strings, parse numbers
              if (typeof value === "string") {
                value = value.trim();
              }

              // Map to required snake_case database fields with flexible column names
              switch (key) {
                case "name":
                case "full_name":
                  rowData.name = value || null;
                  break;
                case "phone_number":
                case "phone":
                  rowData.phone_number = value ? String(value) : null;
                  break;
                case "email_id":
                case "email":
                  rowData.email_id = value || null;
                  break;
                case "address":
                  rowData.address = value || null;
                  break;
                case "age":
                  // Convert to integer, default to 0 if invalid (or null if database allows null)
                  rowData.age = parseInt(value, 10) || 0;
                  break;
                case "application_date":
                case "date":
                  // Ensure it's a clean YYYY-MM-DD format (or null)
                  rowData.application_date =
                    String(value || "").substring(0, 10) || null;
                  break;
                case "parent_name":
                case "guardian":
                  rowData.parent_name = value || null;
                  break;
                default:
                  break;
              }
            });

            // CRITICAL VALIDATION: Check for data integrity before sending to DB
            // If any mandatory field is missing, skip the row
            if (!rowData.name || !rowData.email_id || !rowData.phone_number) {
              console.warn(
                `Skipping row ${
                  rowIndex + 2
                }: Missing essential data (Name, Email, or Phone).`
              );
              return null;
            }

            // Return the object matching the database columns
            return {
              name: rowData.name,
              phone_number: rowData.phone_number,
              email_id: rowData.email_id,
              address: rowData.address,
              age: rowData.age,
              application_date: rowData.application_date,
              parent_name: rowData.parent_name,
            };
          })
          .filter((reg) => reg !== null); // Remove skipped/invalid rows

        if (formatted.length > 0) {
          handleSaveImportedData(formatted);
        } else {
          toast({
            title: "Import Cancelled",
            description:
              "No valid records were found in the file after cleaning.",
            variant: "warning",
          });
        }
      } catch (err) {
        console.error("Excel Read Error:", err);
        toast({
          title: "Error",
          description: `Invalid Excel format or structure: ${err.message}`,
          variant: "destructive",
        });
      } finally {
        // Clear the file input after processing
        e.target.value = null;
      }
    };

    reader.readAsBinaryString(file);
  };

  // ----------------------------------------------------
  // EXPORT EXCEL (No change needed)
  // ----------------------------------------------------
  const handleExport = () => {
    if (registrations.length === 0) {
      toast({
        title: "No Data",
        description: "Nothing to export",
        variant: "destructive",
      });
      return;
    }

    const exportData = registrations.map((reg) => ({
      Name: reg.name,
      Phone_number: reg.phoneNumber,
      Email_id: reg.email,
      Address: reg.address,
      Age: reg.age,
      Application_Date: reg.applicationDate,
      Parent_Name: reg.parentName,
      Status: reg.Status, // Include Status in export
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Registrations");

    XLSX.writeFile(
      wb,
      `Registrations_${new Date().toISOString().split("T")[0]}.xlsx`
    );
  };

  // ----------------------------------------------------
  // DELETE (Rejection API call is performed here)
  // ----------------------------------------------------
const handleDelete = async (id) => {
    try {
      // API call to delete/reject the registration
      await deleteRegistration(id);
      
      // Update local state by filtering out the rejected item
      setRegistrations((prev) => prev.filter((r) => r.id !== id));
      
      // Calculate total items after deletion based on the current filtered list
      const totalItemsAfterDeletion = filteredRegistrations.length - 1;

      // Adjust pagination if the current page is now empty
      if (
        totalItemsAfterDeletion <= (currentPage - 1) * RECORDS_PER_PAGE &&
        currentPage > 1
      ) {
        setCurrentPage((prev) => prev - 1);
      }
      
      toast({
        title: "Success",
        description: `Registration ${id} successfully rejected and removed.`,
      });

    } catch (error) {
      console.error("Deletion failed:", error.message);
      toast({
        title: "Error",
        description: `Failed to reject registration ${id}.`,
        variant: "destructive",
      });
    }
  };

  // ----------------------------------------------------
  // SEARCH & FILTER LOGIC
  // ----------------------------------------------------
  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
    // Reset to the first page on every search
    setCurrentPage(1);
  };
  
  // NEW: Handle status filter change
  const handleFilterStatusChange = (e) => {
    setFilterStatus(e.target.value);
    setCurrentPage(1); // Reset to the first page when changing filters
  }


  const filteredRegistrations = registrations.filter(
    (reg) => {
      // 1. Search Filter
      const searchMatch = 
        reg.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        reg.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        reg.phoneNumber.includes(searchQuery);

      // 2. Status Filter
      const statusMatch = 
        filterStatus === 'All' || 
        reg.Status === filterStatus;

      return searchMatch && statusMatch;
    }
  );

  // ----------------------------------------------------
  // PAGINATION LOGIC
  // ----------------------------------------------------
  const totalPages = Math.ceil(filteredRegistrations.length / RECORDS_PER_PAGE);

  const startIndex = (currentPage - 1) * RECORDS_PER_PAGE;
  const paginatedRegistrations = filteredRegistrations.slice(
    startIndex,
    currentPage * RECORDS_PER_PAGE
  );

  const goToPrevPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const goToNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages, prev + 1));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>📋 Registration Management</CardTitle>
      </CardHeader>

      <CardContent>
        {/* SEARCH + FILTER + IMPORT + EXPORT */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, email, phone..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="pl-10"
            />
          </div>
          
          {/* NEW: Status Filter Select */}
          {/* NOTE: You should ideally replace this with the <Select> component from shadcn/ui */}
          <select 
              value={filterStatus} 
              onChange={handleFilterStatusChange}
              className="border rounded-md px-4 py-2 text-sm bg-background shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
              <option value="All">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
          </select>


          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImport}
            className="hidden"
            // Disable file input while loading
            disabled={isLoading}
          />

          <Button
            variant="outline"
            onClick={() => fileInputRef.current.click()}
            disabled={isLoading}
          >
            <Upload className="h-4 w-4 mr-2" />
            Import Excel
          </Button>

          <Button
            variant="default"
            onClick={handleExport}
            disabled={registrations.length === 0 || isLoading}
          >
            <Download className="h-4 w-4 mr-2" />
            Export Excel
          </Button>
        </div>

        {/* LOADING / EMPTY / TABLE */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground border rounded-lg">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3" />
            <p className="text-lg">
              {/* Show a more specific message during import */}
              {fileInputRef.current && fileInputRef.current.files.length > 0
                ? "Importing and saving data..."
                : "Loading..."}
            </p>
          </div>
        ) : filteredRegistrations.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border rounded-lg">
            <p>No registrations found with the current filter/search</p>
          </div>
        ) : (
          <>
            <div className="border rounded-lg overflow-x-auto mb-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    {/* Serial Number Column Header */}
                    <TableHead className="w-[50px]">Sr/No</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead>Application Date</TableHead>
                    <TableHead>Parent Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {/* Use paginatedRegistrations here */}
                  {paginatedRegistrations.map((reg, index) => (
                    <TableRow key={reg.id ?? `${reg.email}-${index}`}>
                      {/* Serial Number Cell */}
                      <TableCell className="font-medium">
                        {startIndex + index + 1}
                      </TableCell>
                      <TableCell>{reg.name}</TableCell>
                      <TableCell>{reg.phoneNumber}</TableCell>
                      <TableCell>{reg.email}</TableCell>
                      <TableCell>{reg.address}</TableCell>
                      <TableCell>{reg.age}</TableCell>
                      <TableCell>{reg.applicationDate}</TableCell>
                      <TableCell>{reg.parentName}</TableCell>
                      {/* FIX: Use reg.Status (capital S) */}
                      <TableCell>
                        {reg.Status ? (
                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                reg.Status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                                reg.Status === 'Approved' ? 'bg-green-100 text-green-800' :
                                'bg-red-100 text-red-800' // Use red for rejected
                            }`}>
                                {reg.Status}
                            </span>
                        ) : 'N/A'}
                      </TableCell>
                      <TableCell className="text-right">
                        {/* The handleViewDetails function is now defined */}
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleViewDetails(reg.id)}
                          className="mr-2"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>

                        {/* Only show Trash icon if status is not Approved */}
                        {reg.Status !== 'Approved' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(reg.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* PAGINATION CONTROLS */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Page {currentPage} of {totalPages} (
                  {filteredRegistrations.length} records total)
                </div>
                <div className="space-x-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={goToPrevPage}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={goToNextPage}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
        {registrations.length > 0 && (
          <div className="mt-4 text-sm text-muted-foreground">
            Showing {filteredRegistrations.length} records based on filter and search.
          </div>
        )}

        {/* Dialog component now has the necessary state and handlers */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Registration Details</DialogTitle>
              <DialogDescription>
                Review the registration details and approve or reject the
                application.
              </DialogDescription>
            </DialogHeader>
            {selectedRegistration && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm text-muted-foreground">
                    Name
                  </h4>
                  <p className="text-base">{selectedRegistration.name}</p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm text-muted-foreground">
                    Age
                  </h4>
                  <p className="text-base">{selectedRegistration.age}</p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm text-muted-foreground">
                    Address
                  </h4>
                  <p className="text-base">{selectedRegistration.address}</p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm text-muted-foreground">
                    Email
                  </h4>
                  <p className="text-base">{selectedRegistration.email}</p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm text-muted-foreground">
                    Phone Number
                  </h4>
                  <p className="text-base">
                    {selectedRegistration.phoneNumber}
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm text-muted-foreground">
                    Parent Name
                  </h4>
                  <p className="text-base">{selectedRegistration.parentName}</p>
                </div>
              </div>
            )}
            <DialogFooter className="gap-2 sm:gap-0">
              <Button 
                variant="destructive" 
                onClick={handleReject}
                disabled={isLoading} // Disable while processing
              >
                Reject
              </Button>
              <Button 
                variant="default" 
                onClick={handleApprove}
                disabled={isLoading} // Disable while processing
              >
                Approve
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default PendingRegistrations;