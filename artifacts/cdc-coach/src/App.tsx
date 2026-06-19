import { Switch, Route, Router as WouterRouter } from "wouter";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import LockUpSlip from "@/pages/LockUpSlip";
import PropertyRestriction from "@/pages/PropertyRestriction";
import SearchLogAutofill from "@/pages/SearchLogAutofill";
import DC6229DailyRecord from "@/pages/DC6229DailyRecord";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/lock-up-slip" component={LockUpSlip} />
      <Route path="/property-restriction" component={PropertyRestriction} />
      <Route path="/search-log" component={SearchLogAutofill} />
      <Route path="/dc6-229" component={DC6229DailyRecord} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <TooltipProvider>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
