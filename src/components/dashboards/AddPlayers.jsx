import { useState, useEffect, useCallback } from "react";
// 1. Import useNavigate for redirection
import { useNavigate } from "react-router-dom"; 
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  Save,
  UserPlus,
  XCircle,
  LogOut,
  Users,
  AlertCircle,
  DollarSign,
  TrendingUp,
} from "lucide-react";

import { toast } from "sonner"; 
// Assuming you have an API to fetch player details and a new one for coaches
// NOTE: Ensure your API file defines GetCoachDetailslist and AddNewPlayerDetails
// NOTE: GetCoachDetailslist is no longer used, but kept in import for consistency with API structure.
import { AddNewPlayerDetails } from "../../../api"; 

// --- START: Initial State ---

const initialFormData = {
  // Personal Details
  name: "", father_name: "", mother_name: "", gender: "", date_of_birth: "", age: "",
  blood_group: "", phone_no: "", email_id: "", address: "",
  // Guardian & Emergency Details
  emergency_contact_number: "", guardian_contact_number: "", guardian_email_id: "",
  // Medical is now here
  medical_condition: "",
  
  // File Upload Paths (these hold File objects)
  aadhar_upload_path: null, birth_certificate_path: null, profile_photo_path: null,
};

const bloodGroups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
// CATEGORIES constant removed as it's no longer used.

// --- END: Initial State ---

/**
 * Calculates the age in years from a date string (YYYY-MM-DD format).
 * @param {string} dateString - The date of birth in YYYY-MM-DD format.
 * @returns {string} The calculated age as a string, or an empty string if the date is invalid.
 */
const calculateAge = (dateString) => {
    if (!dateString) return "";

    const birthDate = new Date(dateString);
    const today = new Date();

    // Check for invalid date
    if (isNaN(birthDate)) return ""; 

    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();

    // Adjust age if the birthday hasn't occurred yet this year
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    
    // Return age as a string
    return age > 0 ? String(age) : "";
};


const AddPlayerForm = () => {
  const [formData, setFormData] = useState(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // State to help reset file inputs after submission
  const [fileInputKey, setFileInputKey] = useState(Date.now());
  
  // 2. Initialize useNavigate hook
  const navigate = useNavigate();

  // useEffect for fetching coaches is removed as coach_name is deleted.


  const handleSignOut = () => {
    console.log("User signed out!");
    // You would typically call navigate('/login') or similar here
  };

  const handleChange = (e) => {
    const { id, value, type, checked, files } = e.target;

    // Logic to enforce 10-digit numbers and prevent non-numeric input
    if (
      id === "phone_no" ||
      id === "emergency_contact_number" ||
      id === "guardian_contact_number"
    ) {
      const numericValue = value.replace(/\D/g, "").slice(0, 10); 
      setFormData((prev) => ({ ...prev, [id]: numericValue }));
      return;
    }

    if (type === "checkbox") {
      setFormData((prev) => ({ ...prev, [id]: checked }));
    } else if (type === "file") {
      setFormData((prev) => ({ ...prev, [id]: files[0] || null }));
    } else {
      setFormData((prev) => ({ ...prev, [id]: value }));
    }
  };

  const handleSelectChange = (id, value) => {
    setFormData((prev) => {
        let newState = { ...prev, [id]: value };
        
        // AGE CALCULATION LOGIC: If Date of Birth changes, auto-calculate age
        if (id === "date_of_birth") {
            const age = calculateAge(value);
            newState.age = age; // Update age in the form data
        }
        
        return newState;
    });
  };
  
  // Function to fully reset the form and file inputs
  const resetForm = useCallback(() => {
      setFormData(initialFormData);
      // Change the key to force a re-render and reset of file input elements
      setFileInputKey(Date.now()); 
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Frontend validation for required 10-digit numbers
    if (formData.phone_no.length !== 10 || formData.emergency_contact_number.length !== 10) {
        toast.error("Phone Number and Emergency Contact No. must be exactly 10 digits.", { 
            duration: 5000, 
            style: { backgroundColor: '#FFEBEE', color: '#B71C1C', borderColor: '#F44336' } 
        });
        setIsSubmitting(false);
        return;
    }

    // 1. Create FormData object
    const formDataToSend = new FormData();
    
    // Iterate through all keys and append them
    Object.keys(formData).forEach(key => {
        const value = formData[key];
        
        if (value instanceof File) {
             // Appends the file to the FormData object
             formDataToSend.append(key, value, value.name); 
        } 
        else if (value !== null && value !== undefined && key !== "age") {
             // NOTE: 'active' and other removed fields are not present in initialFormData.
             // We skip appending the 'age' field directly as it's auto-calculated.
             // If age is needed by the backend, remove 'key !== "age"' condition.
             formDataToSend.append(key, String(value));
        }
        else if (key === "age" && value !== "") {
             // Append age if it's calculated
             formDataToSend.append(key, String(value));
        }
    });
    
    // --- API Call Integration ---
    try {
         const response = await AddNewPlayerDetails(formDataToSend); 
        
        toast.success(
            `Player added successfully! ${response.message || ''}`, 
            { 
                duration: 5000,
                style: { backgroundColor: '#E8F5E9', color: '#1B5E20', borderColor: '#4CAF50' }
            }
        );
        
        // Reset the form and file inputs
        resetForm(); 
        
        // 3. Navigation after successful submission
        setTimeout(() => {
             navigate('/staff'); // Navigate to the /staff route
        }, 100); // Small delay to allow the toast to show briefly
        

    } catch (error) {
        console.error("Submission failed", error);
        
        const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message || "Failed to add player. Check console for details.";
        toast.error(
            errorMessage, 
            { 
                duration: 10000,
                style: { backgroundColor: '#FFEBEE', color: '#B71C1C', borderColor: '#F44336' }
            }
        );
    } finally {
        setIsSubmitting(false);
    }
  };


  const handleCancel = () => {
    resetForm();
  };

  const renderInputField = (id, label, type = "text", placeholder = "", maxLength = null, disabled = false) => {
      // Use handleSelectChange for date_of_birth to trigger age calculation
      const isDateOfBirth = id === "date_of_birth"; 
      
      return (
          <div className="space-y-2">
            <Label htmlFor={id}>{label}</Label>
            <Input
              id={id}
              type={type}
              placeholder={placeholder}
              // Age and date of birth are handled by handleSelectChange
              value={formData[id] || ""} 
              onChange={isDateOfBirth ? (e) => handleSelectChange(id, e.target.value) : handleChange} 
              maxLength={maxLength}
              disabled={disabled}
            />
          </div>
      );
  };

  const renderFileInput = (id, label) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {/* File Input Key: Use the key prop to force reset the input field in the DOM */}
      <Input
        key={id + fileInputKey} // Unique key ensures re-render on fileInputKey change
        id={id}
        type="file"
        onChange={handleChange}
        className="block w-full text-sm text-gray-500
                   file:mr-4 file:py-2 file:px-4
                   file:rounded-md file:border-0
                   file:text-sm file:font-semibold
                   file:bg-primary file:text-primary-foreground
                   hover:file:bg-primary/90"
      />
      {/* Display selected file name */}
      {formData[id] && formData[id] instanceof File ? (
        <p className="text-xs text-muted-foreground mt-1 text-center font-medium text-green-600">
          Selected File: {formData[id].name}
        </p>
      ) : (
          <p className="text-xs text-muted-foreground mt-1 text-center">
          No file selected.
        </p>
      )}
    </div>
  );


  return (
    <div className="space-y-8 max-w-8xl mx-auto ">
      <div
        className="bg-gradient-primary rounded-xl p-6 text-primary-foreground flex justify-between items-start"
        style={{ backgroundColor: "#2E7D32" }}
      >
        <div className="space-y-1">
          <h1 className="text-2xl font-bold mb-2">Add Administration</h1>
          <p className="text-primary-foreground/80">
            Complete management and oversight
          </p>
        </div>
        <Button
          variant="secondary"
          className="bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>

      {/* 2. Stats Cards (omitted for brevity) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* ... Stat Cards Code ... */}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* === Personal Details === */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {renderInputField("name", "Full Name *", "text", "E.g., Michael Jordan")}
            
            {renderInputField("date_of_birth", "Date of Birth *", "date")} 
            
            {renderInputField("age", "Age (Auto-Calculated)", "number", "e.g., 10", null, true)} 

            {renderInputField("phone_no", "Phone Number *", "tel", "10-digit mobile number", 10)}
            
            {renderInputField("email_id", "Email ID", "email", "E.g., player@example.com")}

            <div className="space-y-2">
              <Label htmlFor="gender">Gender *</Label>
              <Select
                id="gender"
                value={formData.gender}
                onValueChange={(v) => handleSelectChange("gender", v)}
              >
                <SelectTrigger><SelectValue placeholder="Select Gender" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem><SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="blood_group">Blood Group *</Label>
              <Select
                id="blood_group"
                value={formData.blood_group}
                onValueChange={(v) => handleSelectChange("blood_group", v)}
              >
                <SelectTrigger><SelectValue placeholder="Select Blood Group" /></SelectTrigger>
                <SelectContent>
                  {bloodGroups.map((group) => (<SelectItem key={group} value={group}>{group}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-3 space-y-2">
              <Label htmlFor="address">Address *</Label>
              <Textarea
                id="address"
                placeholder="Player's full address"
                value={formData.address}
                onChange={handleChange}
              />
            </div>
          </CardContent>
        </Card>

        {/* === Guardian & Emergency (Medical Added) === */}
        <Card className="shadow-lg">
          <CardHeader><CardTitle>Guardian, Emergency Contact & Medical</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {renderInputField("father_name", "Father's Name", "text", "E.g., John Smith")}
            {renderInputField("mother_name", "Mother's Name", "text", "E.g., Jane Smith")}

            {/* Emergency Contacts Row */}
            <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
              {renderInputField("emergency_contact_number", "Emergency Contact No. *", "tel", "10-digit emergency number", 10)}
              {renderInputField("guardian_contact_number", "Guardian Contact No.", "tel", "Optional 10-digit number", 10)}
              
              {renderInputField("guardian_email_id", "Guardian Email ID", "email", "E.g., guardian@email.com")}
            </div>
            
            {/* Medical Condition Field (Moved Here) */}
            <div className="md:col-span-3 space-y-2">
              <Label htmlFor="medical_condition">Medical Condition/Notes</Label>
              <Textarea
                id="medical_condition"
                placeholder="Any allergies, chronic conditions, or special notes..."
                value={formData.medical_condition}
                onChange={handleChange}
              />
            </div>
          </CardContent>
        </Card>

        {/* === Document Uploads === */}
        <div className="p-6">
          <Card className="shadow-lg">
            <CardHeader><CardTitle>Document Uploads</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {renderFileInput("profile_photo_path", "Player Profile Photo")}
              {renderFileInput("aadhar_upload_path", "Aadhar Card Upload")}
              {renderFileInput("birth_certificate_path", "Birth Certificate Upload")}
            </CardContent>
          </Card>
        </div>

        {/* === Actions === */}
        <div className="flex justify-end space-x-4 pt-4">
          <Button type="button" variant="outline" onClick={handleCancel} disabled={isSubmitting}><XCircle className="h-4 w-4 mr-2" />Cancel & Clear</Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (<Loader2 className="h-4 w-4 mr-2 animate-spin" />) : (<Save className="h-4 w-4 mr-2" />)}
            {isSubmitting ? "Saving Player..." : "Save Player"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default AddPlayerForm;