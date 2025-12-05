import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  Users,
  Calendar as CalendarIcon,
  Clock,
  LogOut,
  CheckCircle,
  UserCheck,
  Target,
} from "lucide-react";
import { fetchCoachAssignedPlayers, recordAttendance, fetchSessionData } from "../../../api";
const processScheduleData = (sessions) => {
  if (!Array.isArray(sessions)) return { todaysSchedule: [], weeklySchedule: [] };
  
  const today = new Date();
  const todayDayOfWeek = today.toLocaleDateString('en-US', { weekday: 'long' }); 
  
  const todaysSchedule = sessions
    .filter(s => s.day_of_week === todayDayOfWeek)
    .map(s => ({ 
      time: `${s.start_time.substring(0, 5)} - ${s.end_time.substring(0, 5)}`,
      group: s.group_category,
      location: s.location || "N/A",
      status: s.status || "Scheduled",
    }));

  const daysOrder = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  
  const groupedByDay = sessions.reduce((acc, session) => {
    const day = session.day_of_week;
    if (!acc[day]) {
      acc[day] = [];
    }
    acc[day].push(`${session.start_time.substring(0, 5)} - ${session.end_time.substring(0, 5)} (${session.group_category})`);
    return acc;
  }, {});
  const weeklySchedule = daysOrder
    .filter(day => groupedByDay[day] && groupedByDay[day].length > 0)
    .map(day => ({
      day: day,
      sessions: groupedByDay[day],
    }));

  return { todaysSchedule, weeklySchedule };
};


const CoachDashboard = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const { user, session, isLoading: isAuthLoading, logout } = useAuth(); 
  const [assignedPlayers, setAssignedPlayers] = useState([]);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);
  const [schedule, setSchedule] = useState({ today: [], weekly: [] });
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(true); 
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const [localAttendance, setLocalAttendance] = useState({});
  const navigate = useNavigate();

  const token = session?.accessToken;

  const handleAttendanceChange = (playerId, status) => {
    setLocalAttendance((prev) => ({
      ...prev,
      [playerId]: status,
    }));
  };

  const handleSubmitAttendance = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    const dateString = selectedDate.toISOString().split("T")[0];    
    
    const coachIdToSend = user?.id; 
    if (!coachIdToSend || !token) { 
        toast({
            title: "Error",
            description: "Authentication missing. Please try signing out and back in.",
            variant: "destructive", 
        });
        setIsSubmitting(false);
        return;
    }

    try {
      const submissionPromises = assignedPlayers.map((player) => {
        const isPresent = (localAttendance[player.id] || "present") === "present";

        const payload = {
          playerId: player.id,
          attendanceDate: dateString,
          isPresent: isPresent,
          coachId: coachIdToSend, 
        };
        
        return recordAttendance(payload, token); 
      });

      const results = await Promise.all(submissionPromises);
      console.log("Batch submission complete:", results);
      toast({
        title: "Attendance Submitted",
        description: `Attendance recorded for ${results.length} players on ${dateString}.`,
        variant: "success", 
      });

    } catch (error) {
      console.error("Attendance Submission Failed:", error);
      toast({
        title: "Submission Failed",
        description: `Failed to submit attendance. Error: ${error.message.substring(
          0,
          80
        )}...`,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = () => {
    logout();
    toast({
      title: "Signed Out",
      description:
        "You have been securely logged out and redirected to the login page.",
      variant: "success",
    });
    navigate("/auth");
  };

  const averageAttendance = useMemo(() => {
    if (!assignedPlayers || assignedPlayers.length === 0) return 0;
    const total = assignedPlayers.reduce((sum, p) => {
      const att =
        typeof p.attendance === "number"
          ? p.attendance
          : parseFloat(p.attendance) || 0;
      return sum + att;
    }, 0);
    return Math.round(total / assignedPlayers.length);
  }, [assignedPlayers]);

  useEffect(() => {
    if (isAuthLoading || !user || !token) { 
      setAssignedPlayers([]);
      setIsLoadingPlayers(false);
      if (user && !token) console.warn("Cannot fetch players: Token is missing.");
      return;
    }

    let isMounted = true;

    const fetchPlayers = async () => {
      setIsLoadingPlayers(true);
      try {
        const players = await fetchCoachAssignedPlayers(token); 
        if (!isMounted) return;
        setAssignedPlayers(players || []);
      } catch (error) {
        console.error("Dashboard failed to load players:", error);
        if (isMounted) setAssignedPlayers([]);
        if (error.message.includes('Invalid Token') || error.message.includes('Forbidden')) {
            toast({
                title: "Authentication Error",
                description: "Session expired or invalid token. Please sign out and sign back in.",
                variant: "destructive"
            });
        }
      } finally {
        if (isMounted) setIsLoadingPlayers(false);
      }
    };

    fetchPlayers();

    return () => {
      isMounted = false;
    };
  }, [isAuthLoading, user, token]); 

  useEffect(() => {
    if (!user?.id || !token) { 
        setSchedule({ today: [], weekly: [] });
        setIsLoadingSchedule(false);
        return;
    }

    let isMounted = true;
    
    const fetchSchedule = async () => {
        setIsLoadingSchedule(true);
        try {
            const data = await fetchSessionData(user.id, token); 
            if (!isMounted) return;

            const { todaysSchedule, weeklySchedule } = processScheduleData(data); 

            setSchedule({
                today: todaysSchedule, 
                weekly: weeklySchedule
            });
        } catch (error) {
            console.error("Dashboard failed to load schedule:", error);
            if (isMounted) setSchedule({ today: [], weekly: [] });
        } finally {
            if (isMounted) setIsLoadingSchedule(false);
        }
    };

    fetchSchedule();

    return () => {
        isMounted = false;
    };
  }, [user, token]); 
  
  const { today: todaysSchedule, weekly: weeklySchedule } = schedule;

  if (isAuthLoading) {
    return (
      <div className="p-10 text-center">
        Authenticating user... Please wait.
      </div>
    );
  }

  if (!user) {
    return null;
  }


  return (
    <div className="space-y-5">
      <div className="bg-gradient-primary rounded-xl p-6 text-primary-foreground flex justify-between items-start">
        <div className="flex-grow">
          <h1 className="text-2xl font-bold mb-2">Coach Dashboard</h1>
          <p className="text-primary-foreground/80">
            Welcome back,{" "}
            <span className="font-semibold">{user?.name || "Coach"}</span>
          </p>
        </div>

        <div className="ml-8 text-right self-center">
          <div className="mt-2 text-sm text-primary-foreground/70 space-y-1">
            <p>Email: {user?.email || "—"}</p>
            <p>Role: {user?.role || "—"}</p>
          </div>
        </div>


        <Button
          variant="secondary"
          className="ml-7 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </div>


      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">
                  {isLoadingPlayers ? "..." : assignedPlayers.length}
                </p>
                <p className="text-xs text-muted-foreground">
                  Assigned Players
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">
                  {isLoadingSchedule ? "..." : todaysSchedule.length}
                </p>
                <p className="text-xs text-muted-foreground">
                  Today's Sessions
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-success" />
              <div>
                <p className="text-2xl font-bold">
                  {isLoadingSchedule ? "..." : 
                    todaysSchedule.filter((s) => s.status === "Completed")
                      .length
                  }
                </p>
                <p className="text-xs text-muted-foreground">Completed Today</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{averageAttendance}%</p>
                <p className="text-xs text-muted-foreground">Avg Attendance</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="players" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="players">Assigned Players</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
        </TabsList>

        <TabsContent value="players" className="space-y-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Assigned Players
              </CardTitle>
              <CardDescription>
                Manage your assigned players and track their progress
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingPlayers ? (
                <div className="p-4 text-center text-muted-foreground">
                  Loading players...
                </div>
              ) : assignedPlayers.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">
                  No players assigned to coach {user.email} or failed to fetch.
                </div>
              ) : (
                <div className="space-y-3">
                  {assignedPlayers.map((player) => {
                    return (
                      <div
                        key={player.id}
                        className="flex items-center justify-between p-4 bg-muted rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-primary-foreground font-bold">
                            {player.name ? player.name.charAt(0) : "?"}
                          </div>
                          <div>
                            <p className="font-medium">
                              {player.name || "Unnamed Player"}
                            </p>
                            <p className="text-xs text-muted-foreground mb-1">
                              ID: {player.id || "—"}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Age {player.age ?? "—"} • {player.position ?? "—"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-medium">
                              {typeof player.attendance === "number"
                                ? `${player.attendance}%`
                                : player.attendance
                                ? `${player.attendance}%`
                                : "—"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Attendance
                            </p>
                          </div>
                          <Badge
                            variant={
                              player.status === "Active"
                                ? "default"
                                : "secondary"
                            }
                          >
                            {player.status || "Unknown"}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Today's Schedule
                </CardTitle>
                <CardDescription>
                  Your training sessions for today
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingSchedule ? (
                    <div className="p-4 text-center text-muted-foreground">
                        Loading today's schedule...
                    </div>
                ) : todaysSchedule.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                        No sessions scheduled for today.
                    </div>
                ) : (
                    <div className="space-y-3">
                    {todaysSchedule.map((session, index) => (
                        <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-muted rounded-lg"
                        >
                        <div>
                            <p className="font-medium">{session.time}</p>
                            <p className="text-sm text-muted-foreground">
                            {session.group} • {session.location}
                            </p>
                        </div>
                        <Badge
                            variant={
                            session.status === "Completed"
                                ? "default"
                                : "secondary"
                            }
                        >
                            {session.status}
                        </Badge>
                        </div>
                    ))}
                    </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarIcon className="h-5 w-5" />
                  Weekly Schedule
                </CardTitle>
                <CardDescription>Your weekly training schedule</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingSchedule ? (
                    <div className="p-4 text-center text-muted-foreground">
                        Loading weekly schedule...
                    </div>
                ) : weeklySchedule.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                        No weekly schedule available.
                    </div>
                ) : (
                    <div className="space-y-3">
                    {weeklySchedule.map((day, index) => (
                        <div key={index} className="border-l-2 border-primary pl-3">
                        <p className="font-medium">{day.day}</p>
                        <div className="text-sm text-muted-foreground">
                            {day.sessions.map((session, sessionIndex) => (
                            <p key={sessionIndex}>{session}</p>
                            ))}
                        </div>
                        </div>
                    ))}
                    </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="attendance" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserCheck className="h-5 w-5" />
                  Mark Attendance
                </CardTitle>
                <CardDescription>
                  Mark players' attendance for current session.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[400px] overflow-y-scroll pr-2">
                  {assignedPlayers.map((player) => {
                    const isPresent =
                      (localAttendance[player.id] || "present") === "present";

                    return (
                      <div
                        key={player.id}
                        className="flex items-center justify-between p-3 bg-muted rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-sm font-bold">
                            {player.name ? player.name.charAt(0) : "?"}
                          </div>
                          <span className="font-medium">
                            {player.name || "Unnamed"}
                          </span>
                        </div>

                        <div className="flex items-center space-x-3">
                          <span
                            className={`font-medium min-w-[55px] text-right ${
                              isPresent ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {isPresent ? "Present" : "Absent"}
                          </span>

                          <label
                            htmlFor={`attendance-switch-${player.id}`}
                            className="relative inline-flex items-center cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              id={`attendance-switch-${player.id}`}
                              className="sr-only peer"
                              checked={isPresent}
                              onChange={(e) => {
                                const newStatus = e.target.checked
                                  ? "present"
                                  : "absent";
                                handleAttendanceChange(player.id, newStatus);
                              }}
                            />
                            <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Button
                  className="w-full mt-4"
                  onClick={handleSubmitAttendance}
                  disabled={isSubmitting || assignedPlayers.length === 0}
                >
                  {isSubmitting ? "Submitting..." : "Submit Attendance"}
                </Button>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle>Calendar</CardTitle>
                <CardDescription>
                  Select date to view/mark attendance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  className="rounded-md border"            
                />

              </CardContent>
            </Card>          
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CoachDashboard;